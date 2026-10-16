"""Async event bus for decoupled pub/sub communication.

Usage:
    bus = EventBus()

    # Subscribe
    async def on_price(event: PriceUpdateEvent):
        print(f"Price update: {event.market_id}")

    bus.subscribe(EventType.PRICE_UPDATE, on_price)

    # Publish
    await bus.publish(EventType.PRICE_UPDATE, PriceUpdateEvent(...))

    # Cleanup
    bus.unsubscribe(EventType.PRICE_UPDATE, on_price)
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Callable, Coroutine
from typing import Any

from karb.events.types import EventType

logger = logging.getLogger(__name__)

Handler = Callable[[Any], Coroutine[Any, Any, None]]


class EventBus:
    """Async event bus with typed publish/subscribe.

    All handlers run concurrently via asyncio.gather when an event is published.
    A failing handler does not prevent other handlers from executing.
    """

    def __init__(self) -> None:
        self._handlers: dict[EventType, list[Handler]] = defaultdict(list)
        self._history_size = 100
        self._recent_events: list[tuple[EventType, Any]] = []

    def subscribe(self, event_type: EventType, handler: Handler) -> None:
        """Register a handler for an event type."""
        if handler not in self._handlers[event_type]:
            self._handlers[event_type].append(handler)
            logger.debug(
                "Subscribed %s to %s (total: %d)",
                handler.__qualname__,
                event_type,
                len(self._handlers[event_type]),
            )

    def unsubscribe(self, event_type: EventType, handler: Handler) -> None:
        """Remove a handler for an event type."""
        handlers = self._handlers[event_type]
        if handler in handlers:
            handlers.remove(handler)
            logger.debug("Unsubscribed %s from %s", handler.__qualname__, event_type)

    def unsubscribe_all(self, event_type: EventType | None = None) -> None:
        """Remove all handlers, optionally for a specific event type."""
        if event_type is not None:
            self._handlers[event_type].clear()
        else:
            self._handlers.clear()

    async def publish(self, event_type: EventType, data: Any) -> None:
        """Publish an event to all subscribed handlers.

        Handlers run concurrently. Exceptions in individual handlers are
        logged but do not propagate or block other handlers.
        """
        handlers = self._handlers.get(event_type, [])
        if not handlers:
            return

        self._recent_events.append((event_type, data))
        if len(self._recent_events) > self._history_size:
            self._recent_events = self._recent_events[-self._history_size :]

        results = await asyncio.gather(
            *[self._safe_call(handler, data) for handler in handlers],
            return_exceptions=True,
        )

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "Handler %s failed for %s: %s",
                    handlers[i].__qualname__,
                    event_type,
                    result,
                    exc_info=result,
                )

    async def _safe_call(self, handler: Handler, data: Any) -> None:
        """Call a handler, catching and re-raising exceptions for gather."""
        await handler(data)

    @property
    def handler_count(self) -> dict[str, int]:
        """Get handler counts per event type (for diagnostics)."""
        return {et.value: len(hs) for et, hs in self._handlers.items() if hs}

    @property
    def recent_events(self) -> list[tuple[EventType, Any]]:
        """Get recent event history (for debugging)."""
        return list(self._recent_events)
