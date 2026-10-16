"""Tests for the NegRisk event scanner."""

import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from karb.api.models import Market, Token
from karb.api.negrisk_models import NegRiskEvent, NegRiskMarketPrices
from karb.api.websocket import BookLevel, OrderBookUpdate, PriceChange
from karb.events.bus import EventBus
from karb.scanner.negrisk_scanner import NegRiskScanner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_raw_event(
    event_id: str = "evt1",
    title: str = "Test Event",
    neg_risk: bool = True,
    num_markets: int = 3,
) -> dict:
    """Build a raw Gamma API event dict."""
    markets = []
    for i in range(num_markets):
        markets.append(
            {
                "id": f"m{i}",
                "conditionId": f"cond_{i}",
                "question": f"Outcome {i}",
                "slug": f"outcome-{i}",
                "clobTokenIds": [f"yes_{i}", f"no_{i}"],
                "outcomePrices": ["0.30", "0.70"],
                "tokens": [
                    {"token_id": f"yes_{i}", "outcome": "Yes", "price": "0.30"},
                    {"token_id": f"no_{i}", "outcome": "No", "price": "0.70"},
                ],
                "volume": "50000",
                "liquidity": "25000",
                "active": True,
                "closed": False,
            }
        )
    return {
        "id": event_id,
        "title": title,
        "slug": title.lower().replace(" ", "-"),
        "negRisk": neg_risk,
        "markets": markets,
    }


# ---------------------------------------------------------------------------
# Parse event
# ---------------------------------------------------------------------------


class TestParseEvent:
    @pytest.fixture(autouse=True)
    def setup(self):
        with patch("karb.scanner.negrisk_scanner.get_settings") as mock_settings:
            s = MagicMock()
            s.gamma_base_url = "https://gamma-api.polymarket.com"
            s.negrisk_min_outcomes = 3
            s.negrisk_max_outcomes = 0
            s.excluded_categories = []
            s.negrisk_priority_categories = []
            mock_settings.return_value = s
            self.scanner = NegRiskScanner(num_connections=0, min_outcomes=3)
            yield

    def test_parse_valid_negrisk_event(self) -> None:
        raw = _make_raw_event(num_markets=3)
        event = self.scanner._parse_event(raw)
        assert event is not None
        assert event.event_id == "evt1"
        assert event.title == "Test Event"
        assert event.k == 3
        assert event.neg_risk is True

    def test_parse_skips_non_negrisk(self) -> None:
        raw = _make_raw_event(neg_risk=False)
        assert self.scanner._parse_event(raw) is None

    def test_parse_skips_single_market(self) -> None:
        raw = _make_raw_event(num_markets=1)
        event = self.scanner._parse_event(raw)
        assert event is None

    def test_parse_extracts_all_markets(self) -> None:
        raw = _make_raw_event(num_markets=5)
        event = self.scanner._parse_event(raw)
        assert event is not None
        assert event.k == 5
        assert len(event.all_yes_token_ids) == 5
        assert len(event.all_no_token_ids) == 5

    def test_parse_end_date_iso(self) -> None:
        raw = _make_raw_event()
        raw["endDate"] = "2028-11-05T00:00:00Z"
        event = self.scanner._parse_event(raw)
        assert event is not None
        assert event.end_date is not None
        assert event.end_date.year == 2028

    def test_parse_end_date_missing(self) -> None:
        raw = _make_raw_event()
        event = self.scanner._parse_event(raw)
        assert event is not None
        assert event.end_date is None

    def test_parse_malformed_returns_none(self) -> None:
        assert self.scanner._parse_event({}) is None
        assert self.scanner._parse_event({"negRisk": True}) is None


# ---------------------------------------------------------------------------
# Load events & lookup tables
# ---------------------------------------------------------------------------


class TestLoadEvents:
    @pytest.fixture(autouse=True)
    def setup(self):
        with patch("karb.scanner.negrisk_scanner.get_settings") as mock_settings:
            s = MagicMock()
            s.gamma_base_url = "https://gamma-api.polymarket.com"
            s.negrisk_min_outcomes = 3
            s.negrisk_max_outcomes = 0
            s.excluded_categories = []
            s.negrisk_priority_categories = []
            mock_settings.return_value = s
            self.scanner = NegRiskScanner(num_connections=1, min_outcomes=3)
            yield

    @pytest.mark.asyncio
    async def test_load_events_builds_lookup_tables(self) -> None:
        raw_events = [_make_raw_event("e1", num_markets=3)]
        self.scanner._fetch_raw_events = AsyncMock(side_effect=[raw_events, []])

        events = await self.scanner.load_events()

        assert len(events) == 1
        assert "e1" in self.scanner._events
        assert self.scanner._token_to_market["yes_0"] == "m0"
        assert self.scanner._token_to_market["no_2"] == "m2"
        assert self.scanner._market_to_event["m1"] == "e1"

    @pytest.mark.asyncio
    async def test_load_events_initializes_prices(self) -> None:
        raw_events = [_make_raw_event("e1", num_markets=3)]
        self.scanner._fetch_raw_events = AsyncMock(side_effect=[raw_events, []])

        await self.scanner.load_events()

        event = self.scanner._events["e1"]
        assert len(event.prices) == 3
        for mid in event.market_ids:
            assert mid in event.prices

    @pytest.mark.asyncio
    async def test_load_events_filters_by_min_outcomes(self) -> None:
        raw_events = [
            _make_raw_event("e1", num_markets=3),
            _make_raw_event("e2", num_markets=2),
        ]
        self.scanner._fetch_raw_events = AsyncMock(side_effect=[raw_events, []])

        events = await self.scanner.load_events()

        assert len(events) == 1
        assert events[0].event_id == "e1"

    @pytest.mark.asyncio
    async def test_load_events_clears_old_state(self) -> None:
        self.scanner._events["old"] = MagicMock()
        self.scanner._token_to_market["old_token"] = "old_market"

        raw_events = [_make_raw_event("new1", num_markets=3)]
        self.scanner._fetch_raw_events = AsyncMock(side_effect=[raw_events, []])

        await self.scanner.load_events()

        assert "old" not in self.scanner._events
        assert "old_token" not in self.scanner._token_to_market
        assert "new1" in self.scanner._events


# ---------------------------------------------------------------------------
# Price updates
# ---------------------------------------------------------------------------


class TestPriceUpdate:
    @pytest.fixture(autouse=True)
    def setup(self, three_outcome_event: NegRiskEvent):
        with patch("karb.scanner.negrisk_scanner.get_settings") as mock_settings:
            s = MagicMock()
            s.gamma_base_url = "https://gamma-api.polymarket.com"
            s.negrisk_min_outcomes = 3
            s.negrisk_max_outcomes = 0
            s.excluded_categories = []
            s.negrisk_priority_categories = []
            mock_settings.return_value = s
            self.scanner = NegRiskScanner(num_connections=0, min_outcomes=3)
            yield

        event = three_outcome_event
        self.scanner._events[event.event_id] = event
        for market in event.markets:
            self.scanner._market_to_event[market.id] = event.event_id
            self.scanner._token_to_market[market.yes_token.token_id] = market.id
            self.scanner._token_to_market[market.no_token.token_id] = market.id

    def _setup_event(self, event: NegRiskEvent) -> None:
        self.scanner._events[event.event_id] = event
        for market in event.markets:
            self.scanner._market_to_event[market.id] = event.event_id
            self.scanner._token_to_market[market.yes_token.token_id] = market.id
            self.scanner._token_to_market[market.no_token.token_id] = market.id

    def test_update_yes_price(self, three_outcome_event: NegRiskEvent) -> None:
        self._setup_event(three_outcome_event)

        self.scanner._update_prices("yes_a", Decimal("0.43"), Decimal("0.46"), Decimal("900"))

        p = three_outcome_event.prices["m1"]
        assert p.yes_best_bid == Decimal("0.43")
        assert p.yes_best_ask == Decimal("0.46")
        assert p.yes_depth == Decimal("900")

    def test_update_no_price(self, three_outcome_event: NegRiskEvent) -> None:
        self._setup_event(three_outcome_event)

        self.scanner._update_prices("no_b", Decimal("0.68"), Decimal("0.72"), Decimal("400"))

        p = three_outcome_event.prices["m2"]
        assert p.no_best_bid == Decimal("0.68")
        assert p.no_best_ask == Decimal("0.72")
        assert p.no_depth == Decimal("400")

    def test_update_unknown_token_ignored(self) -> None:
        self.scanner._update_prices("unknown_token", Decimal("1"), Decimal("1"))
        # Should not raise

    def test_on_book_update_updates_prices(self, three_outcome_event: NegRiskEvent) -> None:
        self._setup_event(three_outcome_event)

        update = OrderBookUpdate(
            asset_id="yes_a",
            market_id="m1",
            bids=[BookLevel(Decimal("0.44"), Decimal("200"))],
            asks=[BookLevel(Decimal("0.46"), Decimal("500"))],
            timestamp="2025-01-01T00:00:00Z",
        )
        self.scanner._on_book_update(update)

        p = three_outcome_event.prices["m1"]
        assert p.yes_best_ask == Decimal("0.46")
        assert p.yes_depth == Decimal("500")

    def test_on_price_change_updates_prices(self, three_outcome_event: NegRiskEvent) -> None:
        self._setup_event(three_outcome_event)

        change = PriceChange(
            asset_id="no_c",
            market_id="m3",
            price=Decimal("0.82"),
            size=Decimal("300"),
            side="SELL",
            best_bid=Decimal("0.81"),
            best_ask=Decimal("0.82"),
        )
        self.scanner._on_price_change(change)

        p = three_outcome_event.prices["m3"]
        assert p.no_best_ask == Decimal("0.82")


# ---------------------------------------------------------------------------
# Callback invocation
# ---------------------------------------------------------------------------


class TestCallback:
    @pytest.fixture(autouse=True)
    def setup(self, three_outcome_event: NegRiskEvent):
        with patch("karb.scanner.negrisk_scanner.get_settings") as mock_settings:
            s = MagicMock()
            s.gamma_base_url = "https://gamma-api.polymarket.com"
            s.negrisk_min_outcomes = 3
            s.negrisk_max_outcomes = 0
            s.excluded_categories = []
            s.negrisk_priority_categories = []
            mock_settings.return_value = s

            self.callback = AsyncMock()
            self.scanner = NegRiskScanner(
                num_connections=0,
                min_outcomes=3,
                on_price_update=self.callback,
            )
            yield

    def _setup_event(self, event: NegRiskEvent) -> None:
        self.scanner._events[event.event_id] = event
        for market in event.markets:
            self.scanner._market_to_event[market.id] = event.event_id
            self.scanner._token_to_market[market.yes_token.token_id] = market.id
            self.scanner._token_to_market[market.no_token.token_id] = market.id

    @pytest.mark.asyncio
    async def test_callback_invoked_on_price_update(
        self, three_outcome_event: NegRiskEvent
    ) -> None:
        self._setup_event(three_outcome_event)

        self.scanner._update_prices("yes_a", Decimal("0.44"), Decimal("0.46"))

        # Allow the created task to run
        await asyncio.sleep(0.05)

        self.callback.assert_called_once()
        args = self.callback.call_args[0]
        assert args[0].event_id == three_outcome_event.event_id
        assert args[1] == "m1"


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestStats:
    @pytest.fixture(autouse=True)
    def setup(self):
        with patch("karb.scanner.negrisk_scanner.get_settings") as mock_settings:
            s = MagicMock()
            s.gamma_base_url = "https://gamma-api.polymarket.com"
            s.negrisk_min_outcomes = 3
            s.negrisk_max_outcomes = 0
            s.excluded_categories = []
            s.negrisk_priority_categories = []
            mock_settings.return_value = s
            self.scanner = NegRiskScanner(num_connections=0, min_outcomes=3)
            yield

    def test_get_stats_empty(self) -> None:
        stats = self.scanner.get_stats()
        assert stats["events"] == 0
        assert stats["total_markets"] == 0
        assert stats["price_updates"] == 0

    def test_get_events_empty(self) -> None:
        assert self.scanner.get_events() == []

    def test_get_event_not_found(self) -> None:
        assert self.scanner.get_event("nonexistent") is None
