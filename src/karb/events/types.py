"""Event types for the event bus.

Each event type has a corresponding dataclass that carries the event payload.
Subscribers receive these typed payloads, not raw dicts.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class EventType(StrEnum):
    """All event types in the system."""

    PRICE_UPDATE = "price_update"
    ARB_OPPORTUNITY = "arb_opportunity"
    ARB_EXPIRED = "arb_expired"
    ORDER_PLACED = "order_placed"
    ORDER_FILLED = "order_filled"
    ORDER_CANCELLED = "order_cancelled"
    BOT_STATUS = "bot_status"
    NEGRISK_EVENT_DISCOVERED = "negrisk_event_discovered"
    NEGRISK_CONVERSION_COMPLETE = "negrisk_conversion_complete"
    ERROR = "error"


class StrategyType(StrEnum):
    """Arbitrage strategy identifiers shown in UI."""

    YES_ARB = "YES_ARB"
    NO_CONVERT_ARB = "NO_CONVERT_ARB"
    PURE_ARB = "PURE_ARB"


@dataclass(frozen=True)
class PriceUpdateEvent:
    """Emitted when any token price changes via WebSocket."""

    market_id: str
    token_id: str
    outcome: str
    best_bid: Decimal | None
    best_ask: Decimal | None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass(frozen=True)
class ArbOpportunityEvent:
    """Emitted when an arbitrage opportunity is detected or updated."""

    event_id: str
    strategy: StrategyType
    market_ids: list[str]
    price_sum: Decimal
    threshold: Decimal
    margin: Decimal
    roi_pct: Decimal
    j_max: int
    safety_margin: Decimal
    estimated_slippage: Decimal
    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_profitable(self) -> bool:
        return self.margin > self.safety_margin


@dataclass(frozen=True)
class NegRiskEventDiscoveredEvent:
    """Emitted when a new NegRisk event is found via Gamma API."""

    event_id: str
    title: str
    num_outcomes: int
    market_ids: list[str]
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass(frozen=True)
class OrderEvent:
    """Emitted on order lifecycle changes."""

    order_id: str
    token_id: str
    side: str
    price: Decimal
    size: Decimal
    status: str
    filled_size: Decimal = Decimal("0")
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass(frozen=True)
class BotStatusEvent:
    """Emitted on bot state changes."""

    status: str
    mode: str
    active_events: int = 0
    active_opportunities: int = 0
    uptime_seconds: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass(frozen=True)
class ErrorEvent:
    """Emitted when an error occurs in any subsystem."""

    source: str
    error_type: str
    message: str
    details: dict | None = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
