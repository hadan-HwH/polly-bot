"""Opportunity scoring and ranking system.

Ranks detected NegRisk arbitrage opportunities by multiple weighted criteria
to help users prioritize which opportunities to act on first.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from karb.api.negrisk_models import NegRiskArbOpportunity, NegRiskEvent
from karb.events.types import StrategyType
from karb.utils.logging import get_logger

log = get_logger(__name__)


@dataclass
class ScoringWeights:
    """Weights for each scoring criterion (should sum to ~1.0)."""

    roi: float = 0.30
    liquidity: float = 0.25
    execution_feasibility: float = 0.15
    market_size: float = 0.10
    strategy_preference: float = 0.10
    expiry_proximity: float = 0.10


@dataclass
class ScoredOpportunity:
    """An opportunity with its computed score and breakdown."""

    opportunity: NegRiskArbOpportunity
    total_score: float
    roi_score: float = 0.0
    liquidity_score: float = 0.0
    feasibility_score: float = 0.0
    market_size_score: float = 0.0
    strategy_score: float = 0.0
    expiry_score: float = 0.0
    rank: int = 0


class OpportunityRecommender:
    """Scores and ranks NegRisk arbitrage opportunities.

    Scoring criteria:
    - ROI (return on investment)
    - Liquidity (minimum orderbook depth across outcomes)
    - Execution feasibility (slippage vs margin)
    - Market size (total volume)
    - Strategy type preference (NO_CONVERT_ARB preferred for instant settlement)
    - Expiry proximity (closer expiry = more certain for YES_ARB)
    """

    def __init__(self, weights: ScoringWeights | None = None) -> None:
        self.weights = weights or ScoringWeights()

    def rank(
        self,
        opportunities: list[NegRiskArbOpportunity],
        events: dict[str, NegRiskEvent] | None = None,
    ) -> list[ScoredOpportunity]:
        """Score and rank a list of opportunities.

        Args:
            opportunities: Detected arb opportunities
            events: Optional event lookup for extra context (market_size, expiry)

        Returns:
            Scored opportunities sorted by total_score descending
        """
        if not opportunities:
            return []

        scored: list[ScoredOpportunity] = []
        for opp in opportunities:
            event = events.get(opp.event_id) if events else None
            s = self._score(opp, event)
            scored.append(s)

        scored.sort(key=lambda s: s.total_score, reverse=True)
        for i, s in enumerate(scored):
            s.rank = i + 1

        return scored

    def _score(
        self,
        opp: NegRiskArbOpportunity,
        event: NegRiskEvent | None = None,
    ) -> ScoredOpportunity:
        """Compute score for a single opportunity."""
        roi = self._score_roi(opp)
        liq = self._score_liquidity(opp)
        feas = self._score_feasibility(opp)
        msize = self._score_market_size(opp, event)
        strat = self._score_strategy(opp)
        expiry = self._score_expiry(opp, event)

        total = (
            roi * self.weights.roi
            + liq * self.weights.liquidity
            + feas * self.weights.execution_feasibility
            + msize * self.weights.market_size
            + strat * self.weights.strategy_preference
            + expiry * self.weights.expiry_proximity
        )

        return ScoredOpportunity(
            opportunity=opp,
            total_score=total,
            roi_score=roi,
            liquidity_score=liq,
            feasibility_score=feas,
            market_size_score=msize,
            strategy_score=strat,
            expiry_score=expiry,
        )

    def _score_roi(self, opp: NegRiskArbOpportunity) -> float:
        """Score ROI on 0-1 scale. 10%+ ROI maps to 1.0."""
        roi_pct = float(opp.roi_pct) * 100
        return min(roi_pct / 10.0, 1.0)

    def _score_liquidity(self, opp: NegRiskArbOpportunity) -> float:
        """Score liquidity based on j_max. 1000+ maps to 1.0, <10 near 0."""
        if opp.j_max <= 0:
            return 0.0
        return min(opp.j_max / 1000.0, 1.0)

    def _score_feasibility(self, opp: NegRiskArbOpportunity) -> float:
        """Score how much margin exceeds safety margin.

        margin / safety_margin ratio: 2x → 0.25, 5x+ → 1.0.
        """
        if opp.safety_margin <= 0:
            return 1.0
        ratio = float(opp.margin / opp.safety_margin)
        return min(max((ratio - 1) / 4.0, 0.0), 1.0)

    def _score_market_size(self, opp: NegRiskArbOpportunity, event: NegRiskEvent | None) -> float:
        """Score based on total market volume. $1M+ maps to 1.0."""
        if event is None:
            return 0.5
        total_volume = sum(float(m.volume) for m in event.markets)
        return min(total_volume / 1_000_000.0, 1.0)

    def _score_strategy(self, opp: NegRiskArbOpportunity) -> float:
        """Prefer NO_CONVERT_ARB (instant settlement) over YES_ARB."""
        if opp.strategy == StrategyType.NO_CONVERT_ARB:
            return 1.0
        return 0.5

    def _score_expiry(self, opp: NegRiskArbOpportunity, event: NegRiskEvent | None) -> float:
        """Score expiry proximity.

        For NO_CONVERT_ARB (instant settlement), expiry doesn't matter as much.
        For YES_ARB, closer expiry means faster capital return.
        """
        if opp.strategy == StrategyType.NO_CONVERT_ARB:
            return 0.7

        if event is None or event.end_date is None:
            return 0.3

        now = datetime.now(UTC)
        end = event.end_date
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)

        days_until = (end - now).days
        if days_until <= 0:
            return 1.0
        if days_until <= 7:
            return 0.9
        if days_until <= 30:
            return 0.6
        return 0.3
