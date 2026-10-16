"""Tests for NegRisk data models."""

from decimal import Decimal

import pytest

from karb.api.negrisk_models import NegRiskEvent, NegRiskMarketPrices


class TestNegRiskEvent:
    def test_k_returns_outcome_count(self, three_outcome_event: NegRiskEvent) -> None:
        assert three_outcome_event.k == 3

    def test_market_ids(self, three_outcome_event: NegRiskEvent) -> None:
        assert three_outcome_event.market_ids == ["m1", "m2", "m3"]

    def test_all_token_ids(self, three_outcome_event: NegRiskEvent) -> None:
        yes_ids = three_outcome_event.all_yes_token_ids
        no_ids = three_outcome_event.all_no_token_ids
        assert len(yes_ids) == 3
        assert len(no_ids) == 3
        assert "yes_a" in yes_ids
        assert "no_c" in no_ids

    def test_yes_price_sum(self, three_outcome_event: NegRiskEvent) -> None:
        result = three_outcome_event.yes_price_sum()
        assert result == Decimal("0.90")

    def test_no_price_sum(self, three_outcome_event: NegRiskEvent) -> None:
        """NO prices: 0.55 + 0.70 + 0.85 = 2.10"""
        result = three_outcome_event.no_price_sum()
        assert result == Decimal("2.10")

    def test_price_sum_returns_none_when_missing(
        self, three_outcome_event: NegRiskEvent,
    ) -> None:
        three_outcome_event.prices["m2"].yes_best_ask = None
        assert three_outcome_event.yes_price_sum() is None

    def test_min_yes_depth(self, three_outcome_event: NegRiskEvent) -> None:
        assert three_outcome_event.min_yes_depth() == Decimal("500")

    def test_min_no_depth(self, three_outcome_event: NegRiskEvent) -> None:
        assert three_outcome_event.min_no_depth() == Decimal("350")


class TestNegRiskMarketPrices:
    def test_has_prices_true(self) -> None:
        p = NegRiskMarketPrices(
            market_id="m1", question="test",
            yes_best_ask=Decimal("0.5"), no_best_ask=Decimal("0.5"),
        )
        assert p.has_prices is True

    def test_has_prices_false_when_missing(self) -> None:
        p = NegRiskMarketPrices(market_id="m1", question="test")
        assert p.has_prices is False


class TestYesArbCondition:
    """Verify YES_ARB: sum of YES prices < 1"""

    def test_yes_arb_profitable(self, three_outcome_event: NegRiskEvent) -> None:
        yes_sum = three_outcome_event.yes_price_sum()
        assert yes_sum is not None
        assert yes_sum < Decimal("1")

    def test_yes_arb_not_profitable(self, no_opportunity_event: NegRiskEvent) -> None:
        yes_sum = no_opportunity_event.yes_price_sum()
        assert yes_sum is not None
        assert yes_sum >= Decimal("1")


class TestNoConvertArbCondition:
    """Verify NO_CONVERT_ARB: sum of NO prices < k-1"""

    def test_no_arb_not_profitable_at_fair_prices(
        self, three_outcome_event: NegRiskEvent,
    ) -> None:
        """With NO sum = 2.10 and k-1 = 2, this is NOT profitable."""
        no_sum = three_outcome_event.no_price_sum()
        k_minus_1 = Decimal(str(three_outcome_event.k - 1))
        assert no_sum is not None
        assert no_sum >= k_minus_1

    def test_no_arb_profitable_when_nos_cheap(
        self, three_outcome_event: NegRiskEvent,
    ) -> None:
        """Manually set cheap NO prices to create opportunity."""
        three_outcome_event.prices["m1"].no_best_ask = Decimal("0.40")
        three_outcome_event.prices["m2"].no_best_ask = Decimal("0.50")
        three_outcome_event.prices["m3"].no_best_ask = Decimal("0.60")

        no_sum = three_outcome_event.no_price_sum()
        k_minus_1 = Decimal(str(three_outcome_event.k - 1))
        assert no_sum is not None
        assert no_sum == Decimal("1.50")
        assert no_sum < k_minus_1

    def test_no_arb_not_profitable(self, no_opportunity_event: NegRiskEvent) -> None:
        no_sum = no_opportunity_event.no_price_sum()
        k_minus_1 = Decimal(str(no_opportunity_event.k - 1))
        assert no_sum is not None
        assert no_sum >= k_minus_1


class TestLowLiquidity:
    def test_min_depth_reflects_bottleneck(self, low_liquidity_event: NegRiskEvent) -> None:
        assert low_liquidity_event.min_yes_depth() == Decimal("5")
        assert low_liquidity_event.min_no_depth() == Decimal("3")
