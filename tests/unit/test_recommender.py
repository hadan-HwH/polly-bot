"""Tests for the opportunity recommender / scoring system."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from karb.api.models import Market, Token
from karb.api.negrisk_models import (
    MarketBreakdown,
    NegRiskArbOpportunity,
    NegRiskEvent,
    NegRiskMarketPrices,
)
from karb.analyzer.recommender import (
    OpportunityRecommender,
    ScoredOpportunity,
    ScoringWeights,
)
from karb.events.types import StrategyType

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _opp(
    strategy: StrategyType = StrategyType.YES_ARB,
    roi_pct: str = "0.10",
    j_max: int = 500,
    margin: str = "0.10",
    safety_margin: str = "0.02",
    event_id: str = "evt1",
) -> NegRiskArbOpportunity:
    return NegRiskArbOpportunity(
        event_id=event_id,
        event_title="Test",
        strategy=strategy,
        num_outcomes=3,
        active_outcomes=3,
        price_sum=Decimal("0.90"),
        threshold=Decimal("1"),
        margin=Decimal(margin),
        roi_pct=Decimal(roi_pct),
        j_max=j_max,
        estimated_profit_usd=Decimal("50"),
        safety_margin=Decimal(safety_margin),
        estimated_slippage=Decimal("0.005"),
        gas_fee_estimate=Decimal("0.005"),
        per_market=[],
    )


def _event(
    event_id: str = "evt1",
    volume: float = 500_000.0,
    days_until_end: int = 15,
) -> NegRiskEvent:
    markets = [
        Market(
            id="m1", condition_id="c1", question="Q1", slug="q1",
            yes_token=Token(token_id="y1", outcome="Yes"),
            no_token=Token(token_id="n1", outcome="No"),
            volume=Decimal(str(volume / 3)),
            liquidity=Decimal("10000"),
        ),
        Market(
            id="m2", condition_id="c2", question="Q2", slug="q2",
            yes_token=Token(token_id="y2", outcome="Yes"),
            no_token=Token(token_id="n2", outcome="No"),
            volume=Decimal(str(volume / 3)),
            liquidity=Decimal("10000"),
        ),
        Market(
            id="m3", condition_id="c3", question="Q3", slug="q3",
            yes_token=Token(token_id="y3", outcome="Yes"),
            no_token=Token(token_id="n3", outcome="No"),
            volume=Decimal(str(volume / 3)),
            liquidity=Decimal("10000"),
        ),
    ]
    return NegRiskEvent(
        event_id=event_id,
        title="Test Event",
        slug="test",
        markets=markets,
        end_date=datetime.now(timezone.utc) + timedelta(days=days_until_end),
    )


# ===========================================================================
# Basic ranking
# ===========================================================================


class TestRanking:
    def test_empty_list(self) -> None:
        r = OpportunityRecommender()
        assert r.rank([]) == []

    def test_single_opportunity(self) -> None:
        r = OpportunityRecommender()
        result = r.rank([_opp()])
        assert len(result) == 1
        assert result[0].rank == 1

    def test_higher_roi_ranks_first(self) -> None:
        r = OpportunityRecommender()
        low_roi = _opp(roi_pct="0.02", event_id="e1")
        high_roi = _opp(roi_pct="0.15", event_id="e2")

        result = r.rank([low_roi, high_roi])
        assert result[0].opportunity.event_id == "e2"
        assert result[0].rank == 1
        assert result[1].rank == 2

    def test_ranks_are_sequential(self) -> None:
        r = OpportunityRecommender()
        opps = [
            _opp(roi_pct="0.05", event_id="e1"),
            _opp(roi_pct="0.10", event_id="e2"),
            _opp(roi_pct="0.15", event_id="e3"),
        ]
        result = r.rank(opps)
        ranks = [s.rank for s in result]
        assert ranks == [1, 2, 3]

    def test_with_event_context(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        events = {"evt1": _event()}

        result = r.rank([opp], events=events)
        assert len(result) == 1
        assert result[0].total_score > 0


# ===========================================================================
# Individual score components
# ===========================================================================


class TestROIScore:
    def test_high_roi_max_score(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(roi_pct="0.20")
        assert r._score_roi(opp) == 1.0

    def test_zero_roi(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(roi_pct="0")
        assert r._score_roi(opp) == 0.0

    def test_10pct_roi_equals_1(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(roi_pct="0.10")
        assert r._score_roi(opp) == 1.0

    def test_5pct_roi_equals_half(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(roi_pct="0.05")
        assert r._score_roi(opp) == pytest.approx(0.5)


class TestLiquidityScore:
    def test_high_liquidity_max_score(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(j_max=2000)
        assert r._score_liquidity(opp) == 1.0

    def test_zero_liquidity(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(j_max=0)
        assert r._score_liquidity(opp) == 0.0

    def test_500_is_half(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(j_max=500)
        assert r._score_liquidity(opp) == pytest.approx(0.5)


class TestFeasibilityScore:
    def test_high_ratio_max_score(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(margin="1.0", safety_margin="0.01")
        assert r._score_feasibility(opp) == 1.0

    def test_margin_equals_safety(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(margin="0.02", safety_margin="0.02")
        assert r._score_feasibility(opp) == 0.0

    def test_margin_below_safety(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(margin="0.01", safety_margin="0.02")
        assert r._score_feasibility(opp) == 0.0

    def test_zero_safety_margin(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(safety_margin="0")
        assert r._score_feasibility(opp) == 1.0


class TestMarketSizeScore:
    def test_no_event_default(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        assert r._score_market_size(opp, None) == 0.5

    def test_large_volume(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        event = _event(volume=3_000_000.0)
        assert r._score_market_size(opp, event) == 1.0

    def test_small_volume(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        event = _event(volume=100_000.0)
        assert r._score_market_size(opp, event) == pytest.approx(0.1)


class TestStrategyScore:
    def test_no_convert_preferred(self) -> None:
        r = OpportunityRecommender()
        no_opp = _opp(strategy=StrategyType.NO_CONVERT_ARB)
        yes_opp = _opp(strategy=StrategyType.YES_ARB)

        assert r._score_strategy(no_opp) > r._score_strategy(yes_opp)
        assert r._score_strategy(no_opp) == 1.0
        assert r._score_strategy(yes_opp) == 0.5


class TestExpiryScore:
    def test_no_convert_arb_fixed_score(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.NO_CONVERT_ARB)
        assert r._score_expiry(opp, None) == 0.7

    def test_yes_arb_no_event(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        assert r._score_expiry(opp, None) == 0.3

    def test_yes_arb_no_end_date(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event()
        event.end_date = None
        assert r._score_expiry(opp, event) == 0.3

    def test_yes_arb_expired(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event(days_until_end=-1)
        assert r._score_expiry(opp, event) == 1.0

    def test_yes_arb_within_week(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event(days_until_end=3)
        assert r._score_expiry(opp, event) == 0.9

    def test_yes_arb_within_month(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event(days_until_end=15)
        assert r._score_expiry(opp, event) == 0.6

    def test_yes_arb_far_out(self) -> None:
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event(days_until_end=90)
        assert r._score_expiry(opp, event) == 0.3

    def test_yes_arb_naive_end_date(self) -> None:
        """Ensure naive datetime is handled (no tzinfo)."""
        r = OpportunityRecommender()
        opp = _opp(strategy=StrategyType.YES_ARB)
        event = _event(days_until_end=5)
        event.end_date = datetime.now() + timedelta(days=5)  # naive
        score = r._score_expiry(opp, event)
        assert 0.0 <= score <= 1.0


# ===========================================================================
# Custom weights
# ===========================================================================


class TestCustomWeights:
    def test_roi_only_weights(self) -> None:
        weights = ScoringWeights(
            roi=1.0, liquidity=0.0, execution_feasibility=0.0,
            market_size=0.0, strategy_preference=0.0, expiry_proximity=0.0,
        )
        r = OpportunityRecommender(weights=weights)

        low = _opp(roi_pct="0.01", event_id="e1")
        high = _opp(roi_pct="0.10", event_id="e2")

        result = r.rank([low, high])
        assert result[0].opportunity.event_id == "e2"

    def test_liquidity_only_weights(self) -> None:
        weights = ScoringWeights(
            roi=0.0, liquidity=1.0, execution_feasibility=0.0,
            market_size=0.0, strategy_preference=0.0, expiry_proximity=0.0,
        )
        r = OpportunityRecommender(weights=weights)

        low_liq = _opp(j_max=50, roi_pct="0.20", event_id="e1")
        high_liq = _opp(j_max=900, roi_pct="0.01", event_id="e2")

        result = r.rank([low_liq, high_liq])
        assert result[0].opportunity.event_id == "e2"


# ===========================================================================
# Score breakdown
# ===========================================================================


class TestScoreBreakdown:
    def test_all_scores_between_0_and_1(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        event = _event()
        s = r._score(opp, event)

        assert 0.0 <= s.roi_score <= 1.0
        assert 0.0 <= s.liquidity_score <= 1.0
        assert 0.0 <= s.feasibility_score <= 1.0
        assert 0.0 <= s.market_size_score <= 1.0
        assert 0.0 <= s.strategy_score <= 1.0
        assert 0.0 <= s.expiry_score <= 1.0

    def test_total_score_weighted_sum(self) -> None:
        r = OpportunityRecommender()
        opp = _opp()
        event = _event()
        s = r._score(opp, event)

        expected = (
            s.roi_score * r.weights.roi
            + s.liquidity_score * r.weights.liquidity
            + s.feasibility_score * r.weights.execution_feasibility
            + s.market_size_score * r.weights.market_size
            + s.strategy_score * r.weights.strategy_preference
            + s.expiry_score * r.weights.expiry_proximity
        )
        assert s.total_score == pytest.approx(expected)
