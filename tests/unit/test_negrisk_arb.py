"""Tests for NegRisk arbitrage detection (target: 95%+ coverage)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from karb.api.models import Market, Token
from karb.api.negrisk_models import (
    NegRiskArbOpportunity,
    NegRiskEvent,
    NegRiskMarketPrices,
)
from karb.analyzer.negrisk_arb import (
    SAFETY_BUFFER,
    DetectorConfig,
    NegRiskArbDetector,
)
from karb.events.types import StrategyType

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_market(mid: str, q: str, yes_id: str, no_id: str) -> Market:
    return Market(
        id=mid,
        condition_id=f"cond_{mid}",
        question=q,
        slug=q.lower().replace(" ", "-"),
        yes_token=Token(token_id=yes_id, outcome="Yes"),
        no_token=Token(token_id=no_id, outcome="No"),
        volume=Decimal("100000"),
        liquidity=Decimal("50000"),
    )


def _make_event(
    event_id: str = "evt",
    num_outcomes: int = 3,
    yes_prices: list[str] | None = None,
    no_prices: list[str] | None = None,
    yes_depths: list[str] | None = None,
    no_depths: list[str] | None = None,
    title: str = "Test Event",
) -> NegRiskEvent:
    """Build a NegRiskEvent with specified prices and depths."""
    yes_prices = yes_prices or ["0.30"] * num_outcomes
    no_prices = no_prices or ["0.50"] * num_outcomes
    yes_depths = yes_depths or ["1000"] * num_outcomes
    no_depths = no_depths or ["1000"] * num_outcomes

    markets = []
    for i in range(num_outcomes):
        markets.append(_make_market(f"m{i}", f"Outcome {i}", f"y{i}", f"n{i}"))

    event = NegRiskEvent(
        event_id=event_id, title=title, slug="test", markets=markets,
        end_date=datetime.now(timezone.utc) + timedelta(days=30),
    )

    for i, m in enumerate(markets):
        event.prices[m.id] = NegRiskMarketPrices(
            market_id=m.id,
            question=m.question,
            yes_best_ask=Decimal(yes_prices[i]),
            yes_best_bid=Decimal(yes_prices[i]) - Decimal("0.01"),
            no_best_ask=Decimal(no_prices[i]),
            no_best_bid=Decimal(no_prices[i]) - Decimal("0.01"),
            yes_depth=Decimal(yes_depths[i]),
            no_depth=Decimal(no_depths[i]),
        )

    return event


def _lenient_config(**overrides: object) -> DetectorConfig:
    """Config with very lenient thresholds for testing detection logic.

    depth_ratio defaults to 1.0 so that j_max tests reflect raw min depth.
    yes_arb_max_expiry_days is set high to avoid rejecting test fixtures.
    """
    defaults = dict(
        min_roi=Decimal("0.001"),
        safety_margin=Decimal("0.001"),
        min_j=1,
        gas_fee_per_tx=Decimal("0.001"),
        depth_ratio=Decimal("1.0"),
        yes_arb_max_expiry_days=365,
        yes_arb_min_margin=Decimal("0.001"),
    )
    defaults.update(overrides)
    return DetectorConfig(**defaults)  # type: ignore[arg-type]


# ===========================================================================
# YES_ARB tests
# ===========================================================================


class TestYesArb:
    """Strategy A: sum of YES asks < 1."""

    def test_detect_yes_arb_profitable(self) -> None:
        event = _make_event(
            yes_prices=["0.25", "0.25", "0.25"],
            yes_depths=["500", "500", "500"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 1

        opp = yes_opps[0]
        assert opp.price_sum == Decimal("0.75")
        assert opp.threshold == Decimal("1")
        assert opp.margin == Decimal("0.25")
        assert opp.j_max == 500
        assert opp.roi_pct > Decimal("0")
        assert opp.is_safe

    def test_no_yes_arb_when_sum_gte_1(self) -> None:
        event = _make_event(yes_prices=["0.40", "0.35", "0.30"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0

    def test_no_yes_arb_when_sum_exactly_1(self) -> None:
        event = _make_event(yes_prices=["0.50", "0.30", "0.20"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0

    def test_yes_arb_margin_equals_1_minus_sum(self) -> None:
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert yes_opp.margin == Decimal("0.40")

    def test_yes_arb_roi_calculation(self) -> None:
        event = _make_event(yes_prices=["0.25", "0.25", "0.25"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        expected_roi = (Decimal("1") - Decimal("0.75")) / Decimal("0.75")
        assert abs(opp.roi_pct - expected_roi) < Decimal("0.0001")

    def test_yes_arb_j_max_limited_by_min_depth(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["100", "50", "200"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert opp.j_max == 50

    def test_yes_arb_rejected_below_min_roi(self) -> None:
        event = _make_event(yes_prices=["0.33", "0.33", "0.33"])
        config = _lenient_config(min_roi=Decimal("0.50"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0
        assert detector.stats.rejected_roi > 0

    def test_yes_arb_rejected_below_min_j(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["3", "3", "3"],
        )
        config = _lenient_config(min_j=10)
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0
        assert detector.stats.rejected_liquidity > 0

    def test_yes_arb_rejected_by_safety_margin(self) -> None:
        """Margin exists but is too thin to cover slippage + gas + buffer."""
        event = _make_event(
            yes_prices=["0.33", "0.33", "0.33"],
            yes_depths=["50", "50", "50"],
        )
        config = _lenient_config(gas_fee_per_tx=Decimal("0.50"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0
        assert detector.stats.rejected_safety > 0


# ===========================================================================
# NO_CONVERT_ARB tests
# ===========================================================================


class TestNoConvertArb:
    """Strategy B: sum of NO asks < k-1."""

    def test_detect_no_arb_profitable(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.40", "0.50", "0.60"],
            no_depths=["500", "300", "800"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 1

        opp = no_opps[0]
        assert opp.price_sum == Decimal("1.50")
        assert opp.threshold == Decimal("2")
        assert opp.margin == Decimal("0.50")
        assert opp.j_max == 300

    def test_no_arb_when_sum_gte_threshold(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.70", "0.70", "0.70"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 0

    def test_no_arb_threshold_scales_with_k(self) -> None:
        """5 outcomes → threshold = 4."""
        event = _make_event(
            num_outcomes=5,
            no_prices=["0.50", "0.50", "0.50", "0.50", "0.50"],
            no_depths=["100"] * 5,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 1
        assert no_opps[0].threshold == Decimal("4")
        assert no_opps[0].margin == Decimal("1.50")

    def test_no_arb_roi_calculation(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.40", "0.50", "0.60"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]
        expected_roi = (Decimal("2") - Decimal("1.50")) / Decimal("1.50")
        assert abs(opp.roi_pct - expected_roi) < Decimal("0.0001")

    def test_no_arb_retain_target_is_most_expensive(self) -> None:
        event = _make_event(
            no_prices=["0.30", "0.50", "0.20"],
            no_depths=["100", "100", "100"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 1
        assert no_opps[0].retain_no_market_id == "m1"

    def test_no_arb_retain_target_tiebreak_by_depth(self) -> None:
        event = _make_event(
            no_prices=["0.30", "0.30", "0.30"],
            no_depths=["100", "500", "200"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())

        target = detector._select_retain_target(event)
        assert target == "m1"

    def test_no_arb_rejected_below_min_j(self) -> None:
        event = _make_event(
            no_prices=["0.30", "0.30", "0.30"],
            no_depths=["2", "2", "2"],
        )
        config = _lenient_config(min_j=10)
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 0

    def test_no_arb_gas_estimate_scales_with_k(self) -> None:
        event = _make_event(
            num_outcomes=5,
            no_prices=["0.50", "0.50", "0.50", "0.50", "0.50"],
            no_depths=["100"] * 5,
        )
        detector = NegRiskArbDetector(config=_lenient_config(gas_fee_per_tx=Decimal("0.01")))
        opps = detector.analyze_event(event)

        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]
        # k=5 → num_conversions = 4 → gas = 0.01 * (4+1) = 0.05
        assert no_opp.gas_fee_estimate == Decimal("0.05")


# ===========================================================================
# Both strategies on same event
# ===========================================================================


class TestBothStrategies:
    def test_both_strategies_can_trigger(self) -> None:
        """Event where both YES sum < 1 AND NO sum < k-1."""
        event = _make_event(
            num_outcomes=3,
            yes_prices=["0.20", "0.20", "0.20"],
            no_prices=["0.40", "0.50", "0.60"],
            yes_depths=["100"] * 3,
            no_depths=["100"] * 3,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        strategies = {o.strategy for o in opps}
        assert StrategyType.YES_ARB in strategies
        assert StrategyType.NO_CONVERT_ARB in strategies

    def test_neither_strategy_when_prices_fair(self, no_opportunity_event: NegRiskEvent) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(no_opportunity_event)
        assert len(opps) == 0


# ===========================================================================
# Missing / incomplete prices
# ===========================================================================


class TestMissingPrices:
    def test_missing_yes_price_skips_yes_arb(self) -> None:
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        event.prices["m1"].yes_best_ask = None

        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0

    def test_missing_no_price_excludes_outcome_from_k_active(self) -> None:
        # NO 호가가 없는 아웃컴은 resolved로 보고 k_active에서 제외한다
        # (docs/negrisk-strategy.md §4 "Resolved Outcome 제외 로직").
        event = _make_event(no_prices=["0.30", "0.30", "0.30"])
        event.prices["m0"].no_best_ask = None

        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 1
        assert no_opps[0].active_outcomes == 2
        assert no_opps[0].threshold == Decimal("1")

    def test_empty_prices_dict(self) -> None:
        event = _make_event()
        event.prices.clear()

        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        assert len(opps) == 0

    def test_missing_prices_entry_for_one_market(self) -> None:
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        del event.prices["m2"]

        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0


# ===========================================================================
# Slippage estimation
# ===========================================================================


class TestSlippage:
    def test_slippage_lower_for_deep_books(self) -> None:
        deep = _make_event(yes_prices=["0.50", "0.50", "0.50"], yes_depths=["5000"] * 3)
        shallow = _make_event(yes_prices=["0.50", "0.50", "0.50"], yes_depths=["10"] * 3)

        detector = NegRiskArbDetector(config=_lenient_config())
        slip_deep = detector._estimate_slippage(deep, "yes")
        slip_shallow = detector._estimate_slippage(shallow, "yes")

        assert slip_deep < slip_shallow

    def test_slippage_zero_when_no_prices(self) -> None:
        event = _make_event()
        event.prices.clear()

        detector = NegRiskArbDetector(config=_lenient_config())
        assert detector._estimate_slippage(event, "yes") == Decimal("0")

    def test_slippage_medium_depth(self) -> None:
        event = _make_event(
            yes_prices=["1.00"],
            yes_depths=["500"],
            num_outcomes=1,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        slip = detector._estimate_slippage(event, "yes")
        assert slip == Decimal("0.003")


# ===========================================================================
# Market breakdown
# ===========================================================================


class TestMarketBreakdown:
    def test_breakdown_includes_all_markets(self) -> None:
        event = _make_event(num_outcomes=4)
        detector = NegRiskArbDetector(config=_lenient_config())
        bd = detector._build_market_breakdown(event)
        assert len(bd) == 4

    def test_breakdown_marks_retain_target(self) -> None:
        event = _make_event()
        detector = NegRiskArbDetector(config=_lenient_config())
        bd = detector._build_market_breakdown(event, retain_market_id="m1")

        retain_entries = [b for b in bd if b.is_retain_target]
        assert len(retain_entries) == 1
        assert retain_entries[0].market_id == "m1"

    def test_breakdown_handles_missing_prices(self) -> None:
        event = _make_event()
        del event.prices["m0"]

        detector = NegRiskArbDetector(config=_lenient_config())
        bd = detector._build_market_breakdown(event)
        assert bd[0].yes_price is None
        assert bd[0].no_price is None


# ===========================================================================
# Conversion plan
# ===========================================================================


class TestConversionPlan:
    def test_plan_for_3_outcomes(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.40", "0.50", "0.60"],
            no_depths=["100"] * 3,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]

        plan = detector.build_conversion_plan(event, no_opp, j=10)
        assert plan is not None

        assert len(plan.buy_orders) == 3
        assert len(plan.conversions) == 2
        assert plan.total_return == Decimal("20")
        assert plan.total_cost == Decimal("15.0")
        assert plan.net_profit == Decimal("5.0")

    def test_plan_merges_correct(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.40", "0.50", "0.60"],
            no_depths=["100"] * 3,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]

        plan = detector.build_conversion_plan(event, no_opp, j=10)
        assert plan is not None

        merge_types = [m.merge_type for m in plan.merges]
        assert "yes_no_merge" in merge_types
        assert "complete_set_merge" in merge_types

        yes_no_merge = [m for m in plan.merges if m.merge_type == "yes_no_merge"][0]
        assert yes_no_merge.quantity == 10
        assert yes_no_merge.usdc_output == Decimal("10")

    def test_plan_for_5_outcomes(self) -> None:
        event = _make_event(
            num_outcomes=5,
            no_prices=["0.30", "0.30", "0.30", "0.30", "0.30"],
            no_depths=["100"] * 5,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]

        plan = detector.build_conversion_plan(event, no_opp, j=5)
        assert plan is not None
        assert len(plan.conversions) == 4
        assert plan.total_return == Decimal("20")
        assert plan.total_cost == Decimal("7.50")

    def test_plan_returns_none_for_yes_arb(self) -> None:
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        yes_opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]

        plan = detector.build_conversion_plan(event, yes_opp, j=10)
        assert plan is None

    def test_plan_returns_none_when_no_retain_id(self) -> None:
        event = _make_event(no_prices=["0.30", "0.30", "0.30"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]
        no_opp.retain_no_market_id = None

        plan = detector.build_conversion_plan(event, no_opp, j=10)
        assert plan is None


# ===========================================================================
# NegRiskArbOpportunity properties
# ===========================================================================


class TestOpportunityProperties:
    def test_is_safe_true(self) -> None:
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert opp.is_safe

    def test_net_profit_usd(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["100"] * 3,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]

        expected = opp.estimated_profit_usd - opp.estimated_slippage - opp.gas_fee_estimate
        assert opp.net_profit_usd == expected


# ===========================================================================
# Stats tracking
# ===========================================================================


class TestDetectorStats:
    def test_stats_increment_on_check(self) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector.analyze_event(event)
        assert detector.stats.total_checks == 1

    def test_stats_count_found(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            no_prices=["0.30", "0.30", "0.30"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        detector.analyze_event(event)
        assert detector.stats.yes_arb_found >= 1
        assert detector.stats.no_arb_found >= 1

    def test_get_stats_dict(self) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        stats = detector.get_stats()
        assert "total_checks" in stats
        assert "yes_arb_found" in stats
        assert "no_arb_found" in stats

    def test_reset_stats(self) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector.analyze_event(event)

        detector.reset_stats()
        assert detector.stats.total_checks == 0
        assert detector.stats.yes_arb_found == 0
        assert len(detector._recent) == 0

    def test_recent_opportunities_capped(self) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])

        for _ in range(250):
            detector.analyze_event(event)

        assert len(detector._recent) <= 200

    def test_get_recent_opportunities_is_copy(self) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        event = _make_event(yes_prices=["0.20", "0.20", "0.20"])
        detector.analyze_event(event)

        recent = detector.get_recent_opportunities()
        recent.clear()
        assert len(detector._recent) > 0


# ===========================================================================
# Depth ratio (j_max scaling)
# ===========================================================================


class TestDepthRatio:
    """j_max should be min_depth × depth_ratio to minimise slippage."""

    def test_default_depth_ratio_halves_j_max(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["500", "200", "800"],
        )
        config = _lenient_config(depth_ratio=Decimal("0.5"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert yes_opp.j_max == 100  # min(500,200,800) × 0.5 = 100

    def test_depth_ratio_applied_to_no_arb(self) -> None:
        event = _make_event(
            num_outcomes=3,
            no_prices=["0.40", "0.50", "0.60"],
            no_depths=["500", "300", "800"],
        )
        config = _lenient_config(depth_ratio=Decimal("0.5"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        no_opp = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB][0]
        assert no_opp.j_max == 150  # min(500,300,800) × 0.5 = 150

    def test_depth_ratio_100_pct_uses_full_depth(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["500", "200", "800"],
        )
        config = _lenient_config(depth_ratio=Decimal("1.0"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert yes_opp.j_max == 200

    def test_low_depth_ratio_can_reject_on_min_j(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["10", "10", "10"],
        )
        config = _lenient_config(depth_ratio=Decimal("0.3"), min_j=5)
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0  # 10 × 0.3 = 3 < min_j(5)
        assert detector.stats.rejected_liquidity > 0

    def test_estimated_profit_uses_scaled_j_max(self) -> None:
        event = _make_event(
            yes_prices=["0.25", "0.25", "0.25"],
            yes_depths=["500", "500", "500"],
        )
        config = _lenient_config(depth_ratio=Decimal("0.5"))
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)

        opp = [o for o in opps if o.strategy == StrategyType.YES_ARB][0]
        assert opp.j_max == 250
        expected_profit = Decimal("250") * opp.margin
        assert opp.estimated_profit_usd == expected_profit


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    def test_two_outcome_event(self) -> None:
        event = _make_event(
            num_outcomes=2,
            yes_prices=["0.30", "0.30"],
            no_prices=["0.30", "0.30"],
            yes_depths=["100", "100"],
            no_depths=["100", "100"],
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)
        assert len(opps) >= 1

    def test_large_k_event(self) -> None:
        k = 10
        event = _make_event(
            num_outcomes=k,
            yes_prices=["0.05"] * k,
            no_prices=["0.50"] * k,
            yes_depths=["100"] * k,
            no_depths=["100"] * k,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 1
        assert yes_opps[0].price_sum == Decimal("0.50")

        no_opps = [o for o in opps if o.strategy == StrategyType.NO_CONVERT_ARB]
        assert len(no_opps) == 1
        assert no_opps[0].threshold == Decimal("9")

    def test_zero_depth_rejects(self) -> None:
        event = _make_event(
            yes_prices=["0.20", "0.20", "0.20"],
            yes_depths=["0", "0", "0"],
        )
        config = _lenient_config(min_j=1)
        detector = NegRiskArbDetector(config=config)
        opps = detector.analyze_event(event)
        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0

    def test_decimal_precision_no_error(self) -> None:
        event = _make_event(
            yes_prices=["0.333333", "0.333333", "0.333333"],
            yes_depths=["100"] * 3,
        )
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        if yes_opps:
            assert yes_opps[0].price_sum < Decimal("1")

    def test_with_conftest_three_outcome_event(self, three_outcome_event: NegRiskEvent) -> None:
        detector = NegRiskArbDetector(config=_lenient_config())
        opps = detector.analyze_event(three_outcome_event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 1
        assert yes_opps[0].price_sum == Decimal("0.90")

    def test_with_conftest_low_liquidity_event(self, low_liquidity_event: NegRiskEvent) -> None:
        detector = NegRiskArbDetector(config=_lenient_config(min_j=10))
        opps = detector.analyze_event(low_liquidity_event)

        yes_opps = [o for o in opps if o.strategy == StrategyType.YES_ARB]
        assert len(yes_opps) == 0

    def test_select_retain_target_none_when_no_prices(self) -> None:
        event = _make_event()
        for p in event.prices.values():
            p.no_best_ask = None

        detector = NegRiskArbDetector(config=_lenient_config())
        assert detector._select_retain_target(event) is None
