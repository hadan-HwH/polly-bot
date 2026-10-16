"""NegRisk event scanner for multi-outcome arbitrage detection.

Discovers NegRisk events from the Gamma API, groups markets by event,
and tracks real-time prices via WebSocket for all outcomes.
"""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from karb.api.gamma import GammaClient
from karb.api.models import Market
from karb.api.negrisk_models import NegRiskEvent, NegRiskMarketPrices
from karb.api.websocket import (
    OrderBookUpdate,
    PriceChange,
    WebSocketClient,
)
from karb.config import get_settings
from karb.events.bus import EventBus
from karb.events.types import EventType, PriceUpdateEvent
from karb.utils.categorizer import categorize_market
from karb.utils.logging import get_logger

log = get_logger(__name__)

MAX_ASSETS_PER_WS = 500

PriceUpdateCallback = Callable[["NegRiskEvent", str], Awaitable[None]]


class NegRiskScanner:
    """Scans for NegRisk events and tracks all outcome prices in real-time.

    Workflow:
    1. Fetch NegRisk events from Gamma API (/events?negRisk=true)
    2. Build NegRiskEvent objects with their markets
    3. Subscribe all tokens to WebSocket for real-time updates
    4. On every price update, update NegRiskMarketPrices
    5. Invoke callback so arb detector can react immediately
    """

    def __init__(
        self,
        gamma: GammaClient | None = None,
        event_bus: EventBus | None = None,
        on_price_update: PriceUpdateCallback | None = None,
        num_connections: int = 2,
        min_outcomes: int | None = None,
    ) -> None:
        settings = get_settings()

        self.gamma = gamma or GammaClient()
        self.event_bus = event_bus
        self._on_price_update = on_price_update
        self.num_connections = num_connections
        self.min_outcomes = min_outcomes or settings.negrisk_min_outcomes
        self.max_outcomes = settings.negrisk_max_outcomes

        self.ws_clients: list[WebSocketClient] = []
        for _ in range(self.num_connections):
            client = WebSocketClient(
                on_book=self._on_book_update,
                on_price_change=self._on_price_change,
            )
            self.ws_clients.append(client)

        self._events: dict[str, NegRiskEvent] = {}
        self._token_to_market: dict[str, str] = {}
        self._market_to_event: dict[str, str] = {}
        self._running = False
        self._price_updates = 0

        log.info(
            "NegRisk scanner initialized",
            num_connections=self.num_connections,
            min_outcomes=self.min_outcomes,
            max_outcomes=self.max_outcomes or "unlimited",
        )

    # ------------------------------------------------------------------
    # Event fetching
    # ------------------------------------------------------------------

    async def fetch_events(self) -> list[NegRiskEvent]:
        """Fetch NegRisk events from Gamma API.

        Events are sorted by total volume (descending) and capped to fit
        within WebSocket subscription capacity so that every loaded event
        can receive real-time price updates for ALL its tokens.

        When ``negrisk_priority_categories`` is set, events in those
        categories fill the WS budget first (sorted by volume within the
        priority group), then remaining budget goes to other events.
        """
        log.info("Fetching NegRisk events from Gamma API...")

        settings = get_settings()
        excluded = {c.lower() for c in settings.excluded_categories} if settings.excluded_categories else set()

        all_events: list[NegRiskEvent] = []
        offset = 0
        limit = 100

        while True:
            raw_events = await self._fetch_raw_events(offset=offset, limit=limit)
            if not raw_events:
                break

            for raw in raw_events:
                event = self._parse_event(raw)
                if event is None:
                    continue
                if excluded and categorize_market(event.title, event.slug).lower() in excluded:
                    continue
                if event.k >= self.min_outcomes and (
                    self.max_outcomes == 0 or event.k <= self.max_outcomes
                ):
                    all_events.append(event)

            if len(raw_events) < limit:
                break
            offset += limit

        def _event_volume(e: NegRiskEvent) -> float:
            return sum(float(m.volume or 0) for m in e.markets)

        # 2-pass budget allocation: priority categories fill first
        priority = (
            {c.lower() for c in settings.negrisk_priority_categories}
            if settings.negrisk_priority_categories
            else set()
        )

        if priority:
            priority_events = [
                e for e in all_events
                if categorize_market(e.title, e.slug).lower() in priority
            ]
            other_events = [
                e for e in all_events
                if categorize_market(e.title, e.slug).lower() not in priority
            ]
            priority_events.sort(key=_event_volume, reverse=True)
            other_events.sort(key=_event_volume, reverse=True)
            sorted_events = priority_events + other_events
        else:
            priority_events = []
            sorted_events = sorted(all_events, key=_event_volume, reverse=True)

        # Cap to WS capacity: each event needs k*2 tokens subscribed
        max_tokens = self.num_connections * MAX_ASSETS_PER_WS
        events: list[NegRiskEvent] = []
        token_budget = max_tokens
        priority_selected = 0
        priority_id_set = {id(e) for e in priority_events} if priority else set()

        for event in sorted_events:
            tokens_needed = len(event.all_token_ids)
            if token_budget < tokens_needed:
                continue
            events.append(event)
            token_budget -= tokens_needed
            if id(event) in priority_id_set:
                priority_selected += 1

        log.info(
            "NegRisk events fetched",
            total_available=len(all_events),
            selected=len(events),
            max_tokens=max_tokens,
            tokens_used=max_tokens - token_budget,
            excluded_categories=list(excluded) if excluded else None,
            priority_categories=list(priority) if priority else None,
            priority_available=len(priority_events) if priority else 0,
            priority_selected=priority_selected if priority else 0,
        )
        return events

    async def _fetch_raw_events(self, offset: int = 0, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch raw event data from Gamma API /events endpoint."""
        session = await self.gamma._get_session()
        url = f"{self.gamma.base_url}/events"
        params: dict[str, Any] = {
            "active": "true",
            "closed": "false",
            "negRisk": "true",
            "limit": limit,
            "offset": offset,
        }

        try:
            async with session.get(url, params=params) as response:
                response.raise_for_status()
                data = await response.json()
                if isinstance(data, list):
                    return data
                return []
        except Exception as e:
            log.error("Failed to fetch events", error=str(e))
            return []

    def _parse_event(self, raw: dict[str, Any]) -> NegRiskEvent | None:
        """Parse raw event JSON into a NegRiskEvent."""
        try:
            if not raw.get("negRisk", False):
                return None

            event_id = str(raw.get("id", ""))
            title = raw.get("title", "")
            slug = raw.get("slug", "")

            raw_markets = raw.get("markets", [])
            markets: list[Market] = []
            for rm in raw_markets:
                market = self.gamma.parse_market(rm)
                if market is not None:
                    markets.append(market)

            if len(markets) < 2:
                return None

            end_date = None
            end_date_raw = raw.get("endDate") or raw.get("end_date")
            if end_date_raw and isinstance(end_date_raw, str):
                try:
                    if end_date_raw.endswith("Z"):
                        end_date_raw = end_date_raw[:-1] + "+00:00"
                    end_date = datetime.fromisoformat(end_date_raw)
                except (ValueError, TypeError):
                    pass

            return NegRiskEvent(
                event_id=event_id,
                title=title,
                slug=slug,
                markets=markets,
                neg_risk=True,
                end_date=end_date,
            )

        except Exception as e:
            log.warning("Failed to parse event", event_id=raw.get("id"), error=str(e))
            return None

    # ------------------------------------------------------------------
    # State management
    # ------------------------------------------------------------------

    async def load_events(self) -> list[NegRiskEvent]:
        """Load events and build internal lookup tables."""
        events = await self.fetch_events()

        self._events.clear()
        self._token_to_market.clear()
        self._market_to_event.clear()

        for event in events:
            self._events[event.event_id] = event

            for market in event.markets:
                self._market_to_event[market.id] = event.event_id
                self._token_to_market[market.yes_token.token_id] = market.id
                self._token_to_market[market.no_token.token_id] = market.id

                if market.id not in event.prices:
                    event.prices[market.id] = NegRiskMarketPrices(
                        market_id=market.id,
                        question=market.question,
                    )

        log.info(
            "NegRisk events loaded",
            events=len(events),
            total_markets=sum(e.k for e in events),
            total_tokens=sum(len(e.all_token_ids) for e in events),
        )
        return events

    # ------------------------------------------------------------------
    # WebSocket handling
    # ------------------------------------------------------------------

    async def subscribe_all(self) -> None:
        """Subscribe to WebSocket updates for all event tokens."""
        token_ids: list[str] = []
        for event in self._events.values():
            token_ids.extend(event.all_token_ids)

        if not token_ids:
            log.warning("No tokens to subscribe to")
            return

        for i, client in enumerate(self.ws_clients):
            start = i * MAX_ASSETS_PER_WS
            end = start + MAX_ASSETS_PER_WS
            batch = token_ids[start:end]
            if batch:
                await client.subscribe(batch)
                log.info(f"NegRisk WS {i + 1}: subscribed to {len(batch)} tokens")

    def _on_book_update(self, update: OrderBookUpdate) -> None:
        """Handle orderbook snapshot from WebSocket.

        Depth is the cumulative size across all ask levels, not just the best.
        """
        depth: Decimal | None = None
        if update.asks:
            depth = sum((a.size for a in update.asks), Decimal("0"))

        self._update_prices(
            update.asset_id,
            update.best_bid,
            update.best_ask,
            depth,
        )

    def _on_price_change(self, change: PriceChange) -> None:
        """Handle real-time price change from WebSocket.

        Recalculates cumulative depth from the cached orderbook.
        If no orderbook data is available, passes None to preserve existing depth.
        """
        self._price_updates += 1

        depth: Decimal | None = None
        for client in self.ws_clients:
            orderbook = client.get_orderbook(change.asset_id)
            if orderbook and orderbook.asks:
                depth = sum((a.size for a in orderbook.asks), Decimal("0"))
                break

        self._update_prices(
            change.asset_id,
            change.best_bid,
            change.best_ask,
            depth,
        )

    def _update_prices(
        self,
        token_id: str,
        best_bid: Decimal | None,
        best_ask: Decimal | None,
        depth: Decimal | None = None,
    ) -> None:
        """Update prices for a token and trigger callbacks.

        When depth is None (no orderbook data in this update),
        the previously known depth is preserved.
        """
        market_id = self._token_to_market.get(token_id)
        if not market_id:
            return

        event_id = self._market_to_event.get(market_id)
        if not event_id:
            return

        event = self._events.get(event_id)
        if not event:
            return

        market: Market | None = None
        for m in event.markets:
            if m.id == market_id:
                market = m
                break
        if not market:
            return

        prices = event.prices.get(market_id)
        if not prices:
            prices = NegRiskMarketPrices(market_id=market_id, question=market.question)
            event.prices[market_id] = prices

        if token_id == market.yes_token.token_id:
            prices.yes_best_bid = best_bid
            prices.yes_best_ask = best_ask
            if depth is not None:
                prices.yes_depth = depth
        elif token_id == market.no_token.token_id:
            prices.no_best_bid = best_bid
            prices.no_best_ask = best_ask
            if depth is not None:
                prices.no_depth = depth

        prices.last_updated = datetime.now(UTC)

        if self.event_bus and best_ask is not None:
            outcome = "Yes" if token_id == market.yes_token.token_id else "No"
            asyncio.create_task(
                self.event_bus.publish(
                    EventType.PRICE_UPDATE,
                    PriceUpdateEvent(
                        market_id=market_id,
                        token_id=token_id,
                        outcome=outcome,
                        best_bid=best_bid,
                        best_ask=best_ask,
                    ),
                )
            )

        if self._on_price_update:
            asyncio.create_task(self._on_price_update(event, market_id))

    # ------------------------------------------------------------------
    # Run loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Run the NegRisk scanner (blocking)."""
        self._running = True

        log.info("Starting NegRisk scanner")

        await self.load_events()

        for i, client in enumerate(self.ws_clients):
            await client.connect()
            log.info(f"NegRisk WS {i + 1} connected")

        await self.subscribe_all()

        tasks = [self._run_ws_with_reconnect(i, client) for i, client in enumerate(self.ws_clients)]
        tasks.append(self._periodic_event_refresh())
        tasks.append(self._periodic_stats())

        await asyncio.gather(*tasks)

    async def _run_ws_with_reconnect(self, conn_id: int, client: WebSocketClient) -> None:
        """Run a WebSocket connection with auto-reconnect."""
        while self._running:
            try:
                await client.listen()
            except Exception as e:
                log.error(f"NegRisk WS {conn_id + 1} error", error=str(e))

            if not self._running:
                break

            delay = min(client._reconnect_delay, 30)
            log.info(f"Reconnecting NegRisk WS {conn_id + 1}", delay=delay)
            await asyncio.sleep(delay)
            client._reconnect_delay = min(delay * 2, 60)

            try:
                await client.connect()
                token_ids: list[str] = []
                for event in self._events.values():
                    token_ids.extend(event.all_token_ids)
                start = conn_id * MAX_ASSETS_PER_WS
                end = start + MAX_ASSETS_PER_WS
                batch = token_ids[start:end]
                if batch:
                    await client.subscribe(batch)
            except Exception as e:
                log.error(f"NegRisk WS {conn_id + 1} reconnect failed", error=str(e))

    async def _periodic_event_refresh(self, interval: float = 600) -> None:
        """Periodically refresh event list (default every 10 min)."""
        while self._running:
            await asyncio.sleep(interval)
            try:
                old_count = len(self._events)
                await self.load_events()
                new_count = len(self._events)

                if abs(new_count - old_count) > 2:
                    log.info(
                        "Event list changed, resubscribing",
                        old=old_count,
                        new=new_count,
                    )
                    for client in self.ws_clients:
                        client._subscribed_assets.clear()
                    await self.subscribe_all()
            except Exception as e:
                log.error("Event refresh error", error=str(e))

    async def _periodic_stats(self, interval: float = 120) -> None:
        """Log periodic statistics."""
        while self._running:
            await asyncio.sleep(interval)
            log.info(
                "NegRisk scanner stats",
                events=len(self._events),
                total_markets=sum(e.k for e in self._events.values()),
                price_updates=self._price_updates,
                ws_connected=sum(1 for c in self.ws_clients if c.is_connected),
            )

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def get_events(self) -> list[NegRiskEvent]:
        """Get all tracked NegRisk events."""
        return list(self._events.values())

    def get_event(self, event_id: str) -> NegRiskEvent | None:
        """Get a specific NegRisk event by ID."""
        return self._events.get(event_id)

    def get_stats(self) -> dict[str, Any]:
        """Get scanner statistics."""
        connected = sum(1 for c in self.ws_clients if c.is_connected)
        return {
            "events": len(self._events),
            "total_markets": sum(e.k for e in self._events.values()),
            "price_updates": self._price_updates,
            "ws_connected": connected,
            "ws_connections": f"{connected}/{len(self.ws_clients)}",
        }

    def stop(self) -> None:
        """Stop the scanner."""
        log.info("Stopping NegRisk scanner")
        self._running = False

    async def close(self) -> None:
        """Close all connections."""
        self.stop()
        for client in self.ws_clients:
            await client.close()
        await self.gamma.close()

    async def __aenter__(self) -> "NegRiskScanner":
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
