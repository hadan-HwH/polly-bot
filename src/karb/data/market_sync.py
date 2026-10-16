"""Background worker that syncs market metadata from Gamma API into the local DB.

Runs on a configurable interval (default 5 min). Each cycle fetches the top N
markets ordered by volume and upserts them into ``markets_cache``.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

from karb.api.gamma import GammaClient
from karb.data.repositories import MarketCacheRepository
from karb.utils.logging import get_logger

log = get_logger(__name__)

SYNC_INTERVAL_SECS = 300  # 5 min
PAGES_PER_SYNC = 20  # 20 pages × 100 = 2 000 markets
PAGE_SIZE = 100


def _normalise(raw: dict[str, Any]) -> dict[str, Any]:
    """Transform a raw Gamma API market dict into a flat row for DB upsert."""
    tokens = raw.get("clobTokenIds") or raw.get("clob_token_ids") or ""
    if isinstance(tokens, list):
        tokens = ",".join(tokens)

    yes_price = 0.0
    no_price = 0.0
    if raw.get("outcomePrices"):
        try:
            prices = raw["outcomePrices"]
            if isinstance(prices, str):
                import json

                prices = json.loads(prices)
            if isinstance(prices, list) and len(prices) >= 2:
                yes_price = float(prices[0])
                no_price = float(prices[1])
        except (ValueError, TypeError, IndexError):
            pass

    spread = raw.get("spread", 0) or 0
    if not spread and yes_price and no_price:
        spread = round(1 - yes_price - no_price, 6)

    return {
        "condition_id": raw.get("conditionId") or raw.get("condition_id") or raw.get("id", ""),
        "question_id": raw.get("questionId") or raw.get("question_id") or "",
        "question": raw.get("question") or "",
        "slug": raw.get("slug") or "",
        "category": _extract_category(raw),
        "event_id": _extract_event_slug(raw),
        "volume": float(raw.get("volumeNum") or raw.get("volume") or 0),
        "liquidity": float(raw.get("liquidityNum") or raw.get("liquidity") or 0),
        "yes_price": yes_price,
        "no_price": no_price,
        "spread": float(spread),
        "end_date": raw.get("endDate") or raw.get("end_date"),
        "neg_risk": bool(raw.get("negRisk") or raw.get("neg_risk")),
        "active": raw.get("active", True),
        "closed": raw.get("closed", False),
        "clob_token_ids": tokens,
        "synced_at": datetime.now(UTC).isoformat(),
    }


def _extract_event_slug(raw: dict[str, Any]) -> str:
    slug = raw.get("eventSlug") or raw.get("event_id") or ""
    if slug:
        return slug
    events = raw.get("events")
    if isinstance(events, list) and events and isinstance(events[0], dict):
        return events[0].get("slug", "") or events[0].get("id", "")
    return ""


def _extract_category(raw: dict[str, Any]) -> str:
    tags = raw.get("tags") or []
    if isinstance(tags, list) and tags:
        return tags[0].get("label", "") if isinstance(tags[0], dict) else str(tags[0])
    cat = raw.get("category") or ""
    if cat:
        return cat
    from karb.utils.categorizer import categorize_market

    return categorize_market(raw.get("question", ""), raw.get("slug", ""))


class MarketSyncWorker:
    """Periodically syncs market metadata from Gamma API to local SQLite."""

    def __init__(
        self,
        gamma: GammaClient | None = None,
        interval: int = SYNC_INTERVAL_SECS,
        pages: int = PAGES_PER_SYNC,
    ) -> None:
        self._gamma = gamma
        self._interval = interval
        self._pages = pages
        self._task: asyncio.Task[None] | None = None
        self._running = False

    async def _get_gamma(self) -> GammaClient:
        if self._gamma is None:
            self._gamma = GammaClient()
        return self._gamma

    async def sync_once(self) -> int:
        """Run a single sync cycle. Returns total upserted rows."""
        gamma = await self._get_gamma()
        total = 0

        for page in range(self._pages):
            try:
                raw_markets = await gamma.get_markets(
                    active=True,
                    closed=False,
                    limit=PAGE_SIZE,
                    offset=page * PAGE_SIZE,
                    order="volumeNum",
                    ascending=False,
                )
            except Exception:
                log.warning("Gamma API fetch failed, stopping sync", page=page)
                break

            if not raw_markets:
                break

            rows = [_normalise(m) for m in raw_markets if m.get("conditionId") or m.get("id")]
            if rows:
                count = await MarketCacheRepository.upsert_batch(rows)
                total += count

            if len(raw_markets) < PAGE_SIZE:
                break

        stale = await MarketCacheRepository.mark_stale(older_than_hours=24)
        log.info(
            "Market sync complete",
            upserted=total,
            stale_marked=stale,
        )
        return total

    async def _loop(self) -> None:
        """Internal loop that runs sync_once on an interval."""
        while self._running:
            try:
                await self.sync_once()
            except Exception:
                log.exception("Market sync error")
            await asyncio.sleep(self._interval)

    def start(self) -> None:
        """Start the background sync loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        log.info("Market sync worker started", interval=self._interval)

    async def stop(self) -> None:
        """Stop the background sync loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._gamma:
            await self._gamma.close()
        log.info("Market sync worker stopped")
