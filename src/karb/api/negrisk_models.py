"""Data models for NegRisk markets and arbitrage opportunities.

These extend the base models in models.py with NegRisk-specific concepts:
event grouping, multi-outcome tracking, and conversion strategies.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from karb.api.models import Market
from karb.events.types import StrategyType


@dataclass
class NegRiskMarketPrices:
    """Real-time prices for a single market within a NegRisk event."""

    market_id: str
    question: str
    yes_best_ask: Decimal | None = None
    yes_best_bid: Decimal | None = None
    no_best_ask: Decimal | None = None
    no_best_bid: Decimal | None = None
    yes_depth: Decimal = Decimal("0")
    no_depth: Decimal = Decimal("0")
    last_updated: datetime = field(default_factory=datetime.utcnow)

    @property
    def has_prices(self) -> bool:
        return self.yes_best_ask is not None and self.no_best_ask is not None


@dataclass
class NegRiskEvent:
    """A NegRisk event containing multiple mutually exclusive outcomes.

    This is the top-level grouping unit. Each event has k outcomes (markets),
    and exactly one outcome will win at settlement.
    """

    event_id: str
    title: str
    slug: str
    markets: list[Market]
    neg_risk: bool = True
    end_date: datetime | None = None

    prices: dict[str, NegRiskMarketPrices] = field(default_factory=dict)

    @property
    def k(self) -> int:
        """Number of outcomes in this event."""
        return len(self.markets)

    @property
    def market_ids(self) -> list[str]:
        return [m.id for m in self.markets]

    @property
    def all_yes_token_ids(self) -> list[str]:
        return [m.yes_token.token_id for m in self.markets]

    @property
    def all_no_token_ids(self) -> list[str]:
        return [m.no_token.token_id for m in self.markets]

    @property
    def all_token_ids(self) -> list[str]:
        return self.all_yes_token_ids + self.all_no_token_ids

    def _active_market_ids(self, side: str, min_ask: Decimal | None = None) -> list[str]:
        """Market IDs of active (non-resolved) outcomes for a given side.

        An outcome is active if its ask price >= min_ask.
        When min_ask is None, defaults to > 0 (any non-zero ask).
        For YES_ARB, pass min_ask=0.01 to exclude effectively resolved
        outcomes that linger at 0.1-0.9 cents before formal settlement.
        """
        active: list[str] = []
        for mid in self.market_ids:
            p = self.prices.get(mid)
            if p is None:
                continue
            ask = p.yes_best_ask if side == "yes" else p.no_best_ask
            if ask is None:
                continue
            if min_ask is not None:
                if ask >= min_ask:
                    active.append(mid)
            elif ask > 0:
                active.append(mid)
        return active

    @property
    def k_active_yes(self) -> int:
        return len(self._active_market_ids("yes"))

    @property
    def k_active_no(self) -> int:
        return len(self._active_market_ids("no"))

    def yes_price_sum(self) -> Decimal | None:
        """Sum of all YES best ask prices. None if any price is missing."""
        total = Decimal("0")
        for mid in self.market_ids:
            p = self.prices.get(mid)
            if p is None or p.yes_best_ask is None:
                return None
            total += p.yes_best_ask
        return total

    def no_price_sum(self) -> Decimal | None:
        """Sum of all NO best ask prices. None if any price is missing."""
        total = Decimal("0")
        for mid in self.market_ids:
            p = self.prices.get(mid)
            if p is None or p.no_best_ask is None:
                return None
            total += p.no_best_ask
        return total

    def yes_price_sum_active(
        self, min_ask: Decimal | None = None,
    ) -> tuple[Decimal, int] | None:
        """Sum of YES ask prices for active outcomes only.

        Returns (sum, k_active) or None if no active outcomes.
        Pass min_ask to exclude effectively resolved outcomes.
        """
        active_ids = self._active_market_ids("yes", min_ask=min_ask)
        if not active_ids:
            return None
        total = Decimal("0")
        for mid in active_ids:
            total += self.prices[mid].yes_best_ask  # type: ignore[operator]
        return total, len(active_ids)

    def no_price_sum_active(self) -> tuple[Decimal, int] | None:
        """Sum of NO ask prices for active outcomes only.

        Returns (sum, k_active) or None if no active outcomes.
        """
        active_ids = self._active_market_ids("no")
        if not active_ids:
            return None
        total = Decimal("0")
        for mid in active_ids:
            total += self.prices[mid].no_best_ask  # type: ignore[operator]
        return total, len(active_ids)

    def yes_price_coverage(self) -> tuple[int, int]:
        """Count of outcomes with YES ask prices vs total. Returns (has_ask, total)."""
        has_ask = sum(
            1 for mid in self.market_ids
            if mid in self.prices and self.prices[mid].yes_best_ask is not None
        )
        return has_ask, self.k

    def no_price_coverage(self) -> tuple[int, int]:
        """Count of outcomes with NO ask prices vs total. Returns (has_ask, total)."""
        has_ask = sum(
            1 for mid in self.market_ids
            if mid in self.prices and self.prices[mid].no_best_ask is not None
        )
        return has_ask, self.k

    def min_yes_depth(self) -> Decimal:
        """Minimum order book depth across all YES tokens (bottleneck for j)."""
        depths = [self.prices[mid].yes_depth for mid in self.market_ids if mid in self.prices]
        return min(depths) if depths else Decimal("0")

    def min_no_depth(self) -> Decimal:
        """Minimum order book depth across all NO tokens (bottleneck for j)."""
        depths = [self.prices[mid].no_depth for mid in self.market_ids if mid in self.prices]
        return min(depths) if depths else Decimal("0")

    def classify_outcomes_yes(
        self, resolved_threshold: Decimal,
    ) -> tuple[list[str], list[str], list[str]]:
        """Classify YES outcomes into active, resolved, and illiquid.

        - Active:   YES ask exists and >= resolved_threshold
        - Resolved: YES ask exists but < resolved_threshold (effectively decided)
        - Illiquid: no price data or YES ask is None (empty order book)

        Returns (active_ids, resolved_ids, illiquid_ids).
        """
        active: list[str] = []
        resolved: list[str] = []
        illiquid: list[str] = []

        for mid in self.market_ids:
            p = self.prices.get(mid)
            if p is None or p.yes_best_ask is None:
                illiquid.append(mid)
            elif p.yes_best_ask < resolved_threshold:
                resolved.append(mid)
            else:
                active.append(mid)

        return active, resolved, illiquid

    def min_yes_depth_active(self, min_ask: Decimal | None = None) -> Decimal:
        """Minimum depth across active YES outcomes only."""
        active_ids = self._active_market_ids("yes", min_ask=min_ask)
        depths = [self.prices[mid].yes_depth for mid in active_ids]
        return min(depths) if depths else Decimal("0")

    def min_no_depth_active(self) -> Decimal:
        """Minimum depth across active NO outcomes only."""
        active_ids = self._active_market_ids("no")
        depths = [self.prices[mid].no_depth for mid in active_ids]
        return min(depths) if depths else Decimal("0")


@dataclass
class NegRiskArbOpportunity:
    """A detected NegRisk arbitrage opportunity.

    Contains all information needed for display in the UI calculation breakdown
    and for execution.
    """

    event_id: str
    event_title: str
    strategy: StrategyType
    num_outcomes: int
    active_outcomes: int

    price_sum: Decimal
    threshold: Decimal
    margin: Decimal
    roi_pct: Decimal

    j_max: int
    estimated_profit_usd: Decimal

    safety_margin: Decimal
    estimated_slippage: Decimal
    gas_fee_estimate: Decimal

    per_market: list["MarketBreakdown"]

    retain_no_market_id: str | None = None
    end_date: datetime | None = None

    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_safe(self) -> bool:
        """Whether the opportunity passes the safety margin check."""
        return self.price_sum < self.threshold - self.safety_margin

    @property
    def net_profit_usd(self) -> Decimal:
        """Profit after slippage and gas fees."""
        return self.estimated_profit_usd - self.estimated_slippage - self.gas_fee_estimate


@dataclass
class MarketBreakdown:
    """Per-market price and depth info for the calculation breakdown panel."""

    market_id: str
    question: str
    yes_price: Decimal | None
    no_price: Decimal | None
    yes_depth: Decimal
    no_depth: Decimal
    is_retain_target: bool = False
    is_active: bool = True
    is_illiquid: bool = False
    is_resolved: bool = False


@dataclass
class ConversionPlan:
    """Execution plan for NO_CONVERT_ARB strategy.

    Describes which NOs to buy, which to retain, and the conversion + merge steps.
    """

    event_id: str
    retain_market_id: str
    retain_market_question: str

    buy_orders: list["ConversionBuyOrder"]
    conversions: list["ConversionStep"]
    merges: list["MergeStep"]

    total_cost: Decimal
    total_return: Decimal
    net_profit: Decimal


@dataclass
class ConversionBuyOrder:
    """A NO token purchase order within a conversion plan."""

    market_id: str
    token_id: str
    side: str = "BUY"
    quantity: int = 0
    estimated_price: Decimal = Decimal("0")
    estimated_cost: Decimal = Decimal("0")


@dataclass
class ConversionStep:
    """A NegRisk adapter conversion: NO_i → {YES_j : j ≠ i}."""

    input_market_id: str
    input_token_id: str
    output_yes_token_ids: list[str]
    quantity: int = 0


@dataclass
class MergeStep:
    """A token merge step: YES_i + NO_i → 1 USDC or complete YES set → 1 USDC."""

    merge_type: str  # "yes_no_merge" or "complete_set_merge"
    token_ids: list[str]
    quantity: int = 0
    usdc_output: Decimal = Decimal("0")
