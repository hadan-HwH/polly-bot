"""NegRisk arbitrage detection: YES_ARB and NO_CONVERT_ARB strategies.

Monitors NegRisk events for arbitrage opportunities by checking whether
the sum of YES or NO prices falls below the theoretical threshold.

See docs/negrisk-strategy.md for full strategy documentation.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from karb.api.negrisk_models import (
    ConversionBuyOrder,
    ConversionPlan,
    ConversionStep,
    MarketBreakdown,
    MergeStep,
    NegRiskArbOpportunity,
    NegRiskEvent,
)
from karb.config import get_settings
from karb.events.types import StrategyType
from karb.utils.logging import get_logger

log = get_logger(__name__)

DEFAULT_GAS_FEE_PER_TX = Decimal("0.005")
SAFETY_BUFFER = Decimal("0.005")


@dataclass
class DetectorConfig:
    """Configuration for the NegRisk arb detector."""

    min_roi: Decimal = Decimal("0.01")
    safety_margin: Decimal = Decimal("0.02")
    min_j: int = 5
    gas_fee_per_tx: Decimal = DEFAULT_GAS_FEE_PER_TX
    depth_ratio: Decimal = Decimal("0.5")
    yes_arb_max_expiry_days: int = 30
    yes_arb_min_margin: Decimal = Decimal("0.03")
    yes_resolved_threshold: Decimal = Decimal("0.01")


@dataclass
class NegRiskNearMiss:
    """A NegRisk event that almost qualified as an arb opportunity."""

    event_id: str
    event_title: str
    strategy: str
    num_outcomes: int
    price_sum: float
    threshold: float
    margin: float
    reason: str
    roi_pct: float | None = None
    j_max: int | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class DetectorStats:
    """Runtime statistics for the detector."""

    total_checks: int = 0
    yes_arb_found: int = 0
    no_arb_found: int = 0
    rejected_no_prices: int = 0
    rejected_threshold: int = 0
    rejected_safety: int = 0
    rejected_roi: int = 0
    rejected_liquidity: int = 0
    rejected_expiry: int = 0
    rejected_min_margin: int = 0


class NegRiskArbDetector:
    """Detects NegRisk arbitrage opportunities across events.

    On every price update, checks both YES_ARB and NO_CONVERT_ARB conditions
    for the updated event, calculates ROI, j_max, slippage, and safety margin,
    and returns opportunities that pass all filters.
    """

    def __init__(self, config: DetectorConfig | None = None) -> None:
        if config is None:
            settings = get_settings()
            config = DetectorConfig(
                min_roi=Decimal(str(settings.negrisk_min_roi)),
                safety_margin=Decimal(str(settings.negrisk_safety_margin)),
                depth_ratio=Decimal(str(settings.negrisk_depth_ratio)),
                yes_arb_max_expiry_days=settings.negrisk_yes_arb_max_expiry_days,
                yes_arb_min_margin=Decimal(str(settings.negrisk_yes_arb_min_margin)),
                yes_resolved_threshold=Decimal(str(settings.negrisk_yes_resolved_threshold)),
            )
        self.config = config
        self.stats = DetectorStats()
        self._recent: list[NegRiskArbOpportunity] = []
        self._near_miss: list[NegRiskNearMiss] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze_event(self, event: NegRiskEvent) -> list[NegRiskArbOpportunity]:
        """Analyze a NegRisk event for both YES_ARB and NO_CONVERT_ARB.

        Returns all valid opportunities found (0, 1, or 2).
        """
        self.stats.total_checks += 1
        opportunities: list[NegRiskArbOpportunity] = []

        yes_opp = self._check_yes_arb(event)
        if yes_opp is not None:
            opportunities.append(yes_opp)

        no_opp = self._check_no_convert_arb(event)
        if no_opp is not None:
            opportunities.append(no_opp)

        for opp in opportunities:
            self._recent.append(opp)
        if len(self._recent) > 200:
            self._recent = self._recent[-200:]

        return opportunities

    # ------------------------------------------------------------------
    # Strategy A – YES_ARB
    # ------------------------------------------------------------------

    def _check_yes_arb(self, event: NegRiskEvent) -> NegRiskArbOpportunity | None:
        """Check Strategy A: Buy All YES.

        Condition: Σ p_YES_i < 1 - safety_margin
        Profit: j × (1 - Σ p_YES_i)

        Additional guards for liquidity hold problem:
        YES_ARB has no immediate liquidation path (unlike NO_CONVERT_ARB),
        so capital is locked until expiry. Two extra filters apply:
          (1) margin must exceed yes_arb_min_margin
          (2) event must expire within yes_arb_max_expiry_days
        """
        # Guard: expiration date must be within max_expiry_days
        if event.end_date is not None:
            max_expiry = datetime.now(UTC) + timedelta(days=self.config.yes_arb_max_expiry_days)
            end_aware = (
                event.end_date.replace(tzinfo=UTC)
                if event.end_date.tzinfo is None
                else event.end_date
            )
            if end_aware > max_expiry:
                self.stats.rejected_expiry += 1
                return None
        else:
            self.stats.rejected_expiry += 1
            return None

        resolved_th = self.config.yes_resolved_threshold
        active_ids, resolved_ids, illiquid_ids = event.classify_outcomes_yes(resolved_th)

        # Illiquid outcomes have empty order books (ask=None) — their true
        # value is unknown.  Unlike "resolved" outcomes (ask < 1¢, practically
        # decided), we cannot safely ignore illiquid ones because they may
        # carry real value.  Reject to avoid false positives.
        if illiquid_ids:
            self.stats.rejected_no_prices += 1
            return None

        k_active = len(active_ids)
        if k_active < 2:
            self.stats.rejected_no_prices += 1
            return None

        yes_sum = Decimal("0")
        for mid in active_ids:
            yes_sum += event.prices[mid].yes_best_ask  # type: ignore[operator]

        threshold = Decimal("1")

        if yes_sum >= threshold:
            self.stats.rejected_threshold += 1
            return None

        margin = threshold - yes_sum

        if margin < self.config.yes_arb_min_margin:
            self.stats.rejected_min_margin += 1
            self._record_near_miss(event, "YES_ARB", yes_sum, threshold, margin, "min_margin")
            return None

        estimated_slippage = self._estimate_slippage_active(event, "yes")
        gas_estimate = self.config.gas_fee_per_tx
        dynamic_safety = estimated_slippage + gas_estimate + SAFETY_BUFFER

        if margin <= dynamic_safety:
            self.stats.rejected_safety += 1
            self._record_near_miss(event, "YES_ARB", yes_sum, threshold, margin, "safety_margin")
            return None

        j_max = int(event.min_yes_depth_active(min_ask=resolved_th) * self.config.depth_ratio)
        if j_max < self.config.min_j:
            self.stats.rejected_liquidity += 1
            self._record_near_miss(
                event, "YES_ARB", yes_sum, threshold, margin, "low_liquidity",
                roi_pct=float((threshold - yes_sum) / yes_sum) if yes_sum > 0 else None,
            )
            return None

        roi = (threshold - yes_sum) / yes_sum

        if roi < self.config.min_roi:
            self.stats.rejected_roi += 1
            self._record_near_miss(
                event, "YES_ARB", yes_sum, threshold, margin, "low_roi",
                roi_pct=float(roi), j_max=j_max,
            )
            return None

        estimated_profit = Decimal(str(j_max)) * margin
        per_market = self._build_market_breakdown(event)

        self.stats.yes_arb_found += 1

        return NegRiskArbOpportunity(
            event_id=event.event_id,
            event_title=event.title,
            strategy=StrategyType.YES_ARB,
            num_outcomes=event.k,
            active_outcomes=k_active,
            price_sum=yes_sum,
            threshold=threshold,
            margin=margin,
            roi_pct=roi,
            j_max=j_max,
            estimated_profit_usd=estimated_profit,
            safety_margin=dynamic_safety,
            estimated_slippage=estimated_slippage,
            gas_fee_estimate=gas_estimate,
            per_market=per_market,
            end_date=event.end_date,
            timestamp=datetime.now(UTC),
        )

    # ------------------------------------------------------------------
    # Strategy B – NO_CONVERT_ARB
    # ------------------------------------------------------------------

    def _check_no_convert_arb(self, event: NegRiskEvent) -> NegRiskArbOpportunity | None:
        """Check Strategy B: Buy All NO + Convert.

        Uses active outcomes only (excluding resolved/zero-price outcomes).
        Condition: Σ p_NO_active < (k_active - 1) - safety_margin
        Profit: j × ((k_active - 1) - Σ p_NO_active)
        """
        no_sum = event.no_price_sum()
        k_active = event.k

        if no_sum is None:
            active_result = event.no_price_sum_active()
            if active_result is None:
                self.stats.rejected_no_prices += 1
                return None
            no_sum, k_active = active_result

        if k_active < 2:
            self.stats.rejected_no_prices += 1
            return None

        threshold = Decimal(str(k_active - 1))

        if no_sum >= threshold:
            self.stats.rejected_threshold += 1
            return None

        margin = threshold - no_sum

        num_conversions = k_active - 1
        estimated_slippage = self._estimate_slippage_active(event, "no")
        gas_estimate = self.config.gas_fee_per_tx * Decimal(str(num_conversions + 1))
        dynamic_safety = estimated_slippage + gas_estimate + SAFETY_BUFFER

        if margin <= dynamic_safety:
            self.stats.rejected_safety += 1
            self._record_near_miss(event, "NO_CONVERT_ARB", no_sum, threshold, margin, "safety_margin")
            return None

        j_max = int(event.min_no_depth_active() * self.config.depth_ratio)
        if j_max < self.config.min_j:
            self.stats.rejected_liquidity += 1
            self._record_near_miss(
                event, "NO_CONVERT_ARB", no_sum, threshold, margin, "low_liquidity",
                roi_pct=float((threshold - no_sum) / no_sum) if no_sum > 0 else None,
            )
            return None

        roi = (threshold - no_sum) / no_sum

        if roi < self.config.min_roi:
            self.stats.rejected_roi += 1
            self._record_near_miss(
                event, "NO_CONVERT_ARB", no_sum, threshold, margin, "low_roi",
                roi_pct=float(roi), j_max=j_max,
            )
            return None

        estimated_profit = Decimal(str(j_max)) * margin
        retain_market_id = self._select_retain_target(event)
        per_market = self._build_market_breakdown(event, retain_market_id)

        self.stats.no_arb_found += 1

        return NegRiskArbOpportunity(
            event_id=event.event_id,
            event_title=event.title,
            strategy=StrategyType.NO_CONVERT_ARB,
            num_outcomes=event.k,
            active_outcomes=k_active,
            price_sum=no_sum,
            threshold=threshold,
            margin=margin,
            roi_pct=roi,
            j_max=j_max,
            estimated_profit_usd=estimated_profit,
            safety_margin=dynamic_safety,
            estimated_slippage=estimated_slippage,
            gas_fee_estimate=gas_estimate,
            per_market=per_market,
            retain_no_market_id=retain_market_id,
            end_date=event.end_date,
            timestamp=datetime.now(UTC),
        )

    # ------------------------------------------------------------------
    # Retain target selection
    # ------------------------------------------------------------------

    def _select_retain_target(self, event: NegRiskEvent) -> str | None:
        """Select which NO to retain in NO_CONVERT_ARB strategy.

        Prefers highest NO price (most expensive → least likely outcome).
        Tie-breaks by highest NO orderbook depth.
        """
        best_id: str | None = None
        best_price = Decimal("-1")
        best_depth = Decimal("-1")

        for mid in event.market_ids:
            p = event.prices.get(mid)
            if p is None or p.no_best_ask is None:
                continue
            if p.no_best_ask > best_price or (
                p.no_best_ask == best_price and p.no_depth > best_depth
            ):
                best_price = p.no_best_ask
                best_depth = p.no_depth
                best_id = mid

        return best_id

    # ------------------------------------------------------------------
    # Slippage estimation
    # ------------------------------------------------------------------

    def _estimate_slippage(self, event: NegRiskEvent, side: str) -> Decimal:
        """Estimate total slippage across all outcomes.

        Uses a simplified model based on orderbook depth.
        """
        total_slippage = Decimal("0")

        for mid in event.market_ids:
            p = event.prices.get(mid)
            if p is None:
                continue

            if side == "yes":
                price = p.yes_best_ask or Decimal("0")
                depth = p.yes_depth
            else:
                price = p.no_best_ask or Decimal("0")
                depth = p.no_depth

            if depth > Decimal("1000"):
                slip_rate = Decimal("0.001")
            elif depth > Decimal("100"):
                slip_rate = Decimal("0.003")
            else:
                slip_rate = Decimal("0.01")

            total_slippage += price * slip_rate

        return total_slippage

    def _estimate_slippage_active(self, event: NegRiskEvent, side: str) -> Decimal:
        """Estimate slippage across active outcomes only."""
        total_slippage = Decimal("0")

        for mid in event._active_market_ids(side):
            p = event.prices[mid]
            if side == "yes":
                price = p.yes_best_ask or Decimal("0")
                depth = p.yes_depth
            else:
                price = p.no_best_ask or Decimal("0")
                depth = p.no_depth

            if depth > Decimal("1000"):
                slip_rate = Decimal("0.001")
            elif depth > Decimal("100"):
                slip_rate = Decimal("0.003")
            else:
                slip_rate = Decimal("0.01")

            total_slippage += price * slip_rate

        return total_slippage

    # ------------------------------------------------------------------
    # Market breakdown
    # ------------------------------------------------------------------

    def _build_market_breakdown(
        self, event: NegRiskEvent, retain_market_id: str | None = None
    ) -> list[MarketBreakdown]:
        """Build per-market price and depth breakdown for UI."""
        resolved_th = self.config.yes_resolved_threshold
        breakdowns: list[MarketBreakdown] = []

        for market in event.markets:
            p = event.prices.get(market.id)
            if p is None:
                breakdowns.append(
                    MarketBreakdown(
                        market_id=market.id,
                        question=market.question,
                        yes_price=None,
                        no_price=None,
                        yes_depth=Decimal("0"),
                        no_depth=Decimal("0"),
                        is_active=False,
                        is_illiquid=True,
                    )
                )
                continue

            is_illiquid = p.yes_best_ask is None and p.no_best_ask is None
            is_resolved = (
                p.yes_best_ask is not None
                and p.yes_best_ask < resolved_th
            )
            has_yes = p.yes_best_ask is not None and p.yes_best_ask >= resolved_th
            has_no = p.no_best_ask is not None and p.no_best_ask > 0
            is_active = (has_yes or has_no) and not is_resolved

            breakdowns.append(
                MarketBreakdown(
                    market_id=market.id,
                    question=market.question,
                    yes_price=p.yes_best_ask,
                    no_price=p.no_best_ask,
                    yes_depth=p.yes_depth,
                    no_depth=p.no_depth,
                    is_retain_target=(market.id == retain_market_id),
                    is_active=is_active,
                    is_illiquid=is_illiquid,
                    is_resolved=is_resolved,
                )
            )

        return breakdowns

    # ------------------------------------------------------------------
    # Conversion plan builder (for UI simulator)
    # ------------------------------------------------------------------

    def build_conversion_plan(
        self,
        event: NegRiskEvent,
        opportunity: NegRiskArbOpportunity,
        j: int,
    ) -> ConversionPlan | None:
        """Build a detailed execution plan for NO_CONVERT_ARB.

        Uses active outcomes only (resolved outcomes excluded).
        Used by the UI's conversion simulator.
        """
        if opportunity.strategy != StrategyType.NO_CONVERT_ARB:
            return None

        retain_id = opportunity.retain_no_market_id
        if not retain_id:
            return None

        active_no_ids = set(event._active_market_ids("no"))
        active_markets = [m for m in event.markets if m.id in active_no_ids]

        retain_market = None
        for m in active_markets:
            if m.id == retain_id:
                retain_market = m
                break
        if not retain_market:
            return None

        buy_orders: list[ConversionBuyOrder] = []
        total_cost = Decimal("0")

        for market in active_markets:
            p = event.prices.get(market.id)
            price = p.no_best_ask if p else Decimal("0")
            if price is None:
                price = Decimal("0")
            cost = Decimal(str(j)) * price

            buy_orders.append(
                ConversionBuyOrder(
                    market_id=market.id,
                    token_id=market.no_token.token_id,
                    quantity=j,
                    estimated_price=price,
                    estimated_cost=cost,
                )
            )
            total_cost += cost

        conversions: list[ConversionStep] = []
        for market in active_markets:
            if market.id == retain_id:
                continue
            output_yes_ids = [
                m.yes_token.token_id for m in active_markets if m.id != market.id
            ]
            conversions.append(
                ConversionStep(
                    input_market_id=market.id,
                    input_token_id=market.no_token.token_id,
                    output_yes_token_ids=output_yes_ids,
                    quantity=j,
                )
            )

        merges: list[MergeStep] = []

        merges.append(
            MergeStep(
                merge_type="yes_no_merge",
                token_ids=[
                    retain_market.no_token.token_id,
                    retain_market.yes_token.token_id,
                ],
                quantity=j,
                usdc_output=Decimal(str(j)),
            )
        )

        k_active = len(active_markets)
        complete_sets = j * (k_active - 2)
        if complete_sets > 0:
            merges.append(
                MergeStep(
                    merge_type="complete_set_merge",
                    token_ids=[m.yes_token.token_id for m in active_markets],
                    quantity=complete_sets,
                    usdc_output=Decimal(str(complete_sets)),
                )
            )

        total_return = Decimal(str(j)) * Decimal(str(k_active - 1))
        net_profit = total_return - total_cost

        return ConversionPlan(
            event_id=event.event_id,
            retain_market_id=retain_id,
            retain_market_question=retain_market.question,
            buy_orders=buy_orders,
            conversions=conversions,
            merges=merges,
            total_cost=total_cost,
            total_return=total_return,
            net_profit=net_profit,
        )

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def _record_near_miss(
        self,
        event: NegRiskEvent,
        strategy: str,
        price_sum: Decimal,
        threshold: Decimal,
        margin: Decimal,
        reason: str,
        roi_pct: float | None = None,
        j_max: int | None = None,
    ) -> None:
        """Record a near-miss event for UI display."""
        nm = NegRiskNearMiss(
            event_id=event.event_id,
            event_title=event.title,
            strategy=strategy,
            num_outcomes=event.k,
            price_sum=float(price_sum),
            threshold=float(threshold),
            margin=float(margin),
            reason=reason,
            roi_pct=roi_pct,
            j_max=j_max,
        )
        self._near_miss.append(nm)
        if len(self._near_miss) > 200:
            self._near_miss = self._near_miss[-200:]

    def get_recent_opportunities(self) -> list[NegRiskArbOpportunity]:
        """Get recently detected opportunities."""
        return self._recent.copy()

    def get_near_misses(self) -> list[NegRiskNearMiss]:
        """Get recently recorded near-miss events."""
        return self._near_miss.copy()

    def get_stats(self) -> dict[str, int]:
        """Get detector statistics."""
        return {
            "total_checks": self.stats.total_checks,
            "yes_arb_found": self.stats.yes_arb_found,
            "no_arb_found": self.stats.no_arb_found,
            "rejected_no_prices": self.stats.rejected_no_prices,
            "rejected_threshold": self.stats.rejected_threshold,
            "rejected_safety": self.stats.rejected_safety,
            "rejected_roi": self.stats.rejected_roi,
            "rejected_liquidity": self.stats.rejected_liquidity,
            "rejected_expiry": self.stats.rejected_expiry,
            "rejected_min_margin": self.stats.rejected_min_margin,
        }

    def reset_stats(self) -> None:
        """Reset detector statistics."""
        self.stats = DetectorStats()
        self._recent = []
        self._near_miss = []
