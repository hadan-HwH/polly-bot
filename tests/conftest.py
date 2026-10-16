"""Shared test fixtures for Polly-Bot tests."""

import json
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from karb.api.models import Market, OrderBook, OrderBookLevel, Token
from karb.api.negrisk_models import NegRiskEvent, NegRiskMarketPrices
from karb.events.bus import EventBus


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def event_bus() -> EventBus:
    return EventBus()


def _make_market(
    market_id: str,
    question: str,
    yes_token_id: str,
    no_token_id: str,
    yes_price: str = "0.50",
    no_price: str = "0.50",
) -> Market:
    """Helper to create a Market with given prices."""
    return Market(
        id=market_id,
        condition_id=f"cond_{market_id}",
        question=question,
        slug=question.lower().replace(" ", "-"),
        yes_token=Token(token_id=yes_token_id, outcome="Yes", price=Decimal(yes_price)),
        no_token=Token(token_id=no_token_id, outcome="No", price=Decimal(no_price)),
        volume=Decimal("100000"),
        liquidity=Decimal("50000"),
        active=True,
        closed=False,
        end_date=datetime.utcnow() + timedelta(days=30),
    )


@pytest.fixture
def three_outcome_event() -> NegRiskEvent:
    """A 3-outcome NegRisk event (k=3) with realistic prices.

    Prices: YES sum = 0.90, NO sum = 0.95
    YES_ARB condition: 0.90 < 1.00 ✓
    NO_CONVERT_ARB condition: 0.95 < 2.00 ✓
    """
    markets = [
        _make_market("m1", "Candidate A wins", "yes_a", "no_a", "0.45", "0.55"),
        _make_market("m2", "Candidate B wins", "yes_b", "no_b", "0.30", "0.70"),
        _make_market("m3", "Other candidate wins", "yes_c", "no_c", "0.15", "0.85"),
    ]

    event = NegRiskEvent(
        event_id="evt_election_2028",
        title="2028 Presidential Election",
        slug="2028-presidential-election",
        markets=markets,
        end_date=datetime.utcnow() + timedelta(days=60),
    )

    event.prices = {
        "m1": NegRiskMarketPrices(
            market_id="m1",
            question="Candidate A wins",
            yes_best_ask=Decimal("0.45"),
            yes_best_bid=Decimal("0.44"),
            no_best_ask=Decimal("0.55"),
            no_best_bid=Decimal("0.54"),
            yes_depth=Decimal("1000"),
            no_depth=Decimal("800"),
        ),
        "m2": NegRiskMarketPrices(
            market_id="m2",
            question="Candidate B wins",
            yes_best_ask=Decimal("0.30"),
            yes_best_bid=Decimal("0.29"),
            no_best_ask=Decimal("0.70"),
            no_best_bid=Decimal("0.69"),
            yes_depth=Decimal("500"),
            no_depth=Decimal("350"),
        ),
        "m3": NegRiskMarketPrices(
            market_id="m3",
            question="Other candidate wins",
            yes_best_ask=Decimal("0.15"),
            yes_best_bid=Decimal("0.14"),
            no_best_ask=Decimal("0.85"),
            no_best_bid=Decimal("0.84"),
            yes_depth=Decimal("2000"),
            no_depth=Decimal("1500"),
        ),
    }

    return event


@pytest.fixture
def no_opportunity_event() -> NegRiskEvent:
    """A 3-outcome event where NO arbitrage exists.

    Prices: YES sum = 1.05, NO sum = 2.10
    YES_ARB condition: 1.05 < 1.00 ✗
    NO_CONVERT_ARB condition: 2.10 < 2.00 ✗
    """
    markets = [
        _make_market("m4", "Team A wins", "yes_ta", "no_ta", "0.50", "0.55"),
        _make_market("m5", "Team B wins", "yes_tb", "no_tb", "0.35", "0.70"),
        _make_market("m6", "Draw", "yes_draw", "no_draw", "0.20", "0.85"),
    ]

    event = NegRiskEvent(
        event_id="evt_no_arb",
        title="No Arbitrage Event",
        slug="no-arb",
        markets=markets,
    )

    event.prices = {
        "m4": NegRiskMarketPrices(
            market_id="m4", question="Team A wins",
            yes_best_ask=Decimal("0.50"), no_best_ask=Decimal("0.55"),
            yes_depth=Decimal("1000"), no_depth=Decimal("1000"),
        ),
        "m5": NegRiskMarketPrices(
            market_id="m5", question="Team B wins",
            yes_best_ask=Decimal("0.35"), no_best_ask=Decimal("0.70"),
            yes_depth=Decimal("1000"), no_depth=Decimal("1000"),
        ),
        "m6": NegRiskMarketPrices(
            market_id="m6", question="Draw",
            yes_best_ask=Decimal("0.20"), no_best_ask=Decimal("0.85"),
            yes_depth=Decimal("1000"), no_depth=Decimal("1000"),
        ),
    }

    return event


@pytest.fixture
def low_liquidity_event() -> NegRiskEvent:
    """A profitable event but with very low liquidity on one outcome."""
    markets = [
        _make_market("m7", "Option A", "yes_la", "no_la", "0.40", "0.50"),
        _make_market("m8", "Option B", "yes_lb", "no_lb", "0.25", "0.60"),
        _make_market("m9", "Option C", "yes_lc", "no_lc", "0.10", "0.75"),
    ]

    event = NegRiskEvent(
        event_id="evt_low_liq",
        title="Low Liquidity Event",
        slug="low-liq",
        markets=markets,
    )

    event.prices = {
        "m7": NegRiskMarketPrices(
            market_id="m7", question="Option A",
            yes_best_ask=Decimal("0.40"), no_best_ask=Decimal("0.50"),
            yes_depth=Decimal("500"), no_depth=Decimal("500"),
        ),
        "m8": NegRiskMarketPrices(
            market_id="m8", question="Option B",
            yes_best_ask=Decimal("0.25"), no_best_ask=Decimal("0.60"),
            yes_depth=Decimal("5"), no_depth=Decimal("3"),
        ),
        "m9": NegRiskMarketPrices(
            market_id="m9", question="Option C",
            yes_best_ask=Decimal("0.10"), no_best_ask=Decimal("0.75"),
            yes_depth=Decimal("1000"), no_depth=Decimal("1000"),
        ),
    }

    return event
