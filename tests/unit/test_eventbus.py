"""Tests for the async event bus."""

import asyncio
from decimal import Decimal

import pytest

from karb.events.bus import EventBus
from karb.events.types import EventType, PriceUpdateEvent


@pytest.fixture
def bus() -> EventBus:
    return EventBus()


class TestSubscribePublish:
    async def test_handler_receives_event(self, bus: EventBus) -> None:
        received = []

        async def handler(event: PriceUpdateEvent) -> None:
            received.append(event)

        bus.subscribe(EventType.PRICE_UPDATE, handler)

        event = PriceUpdateEvent(
            market_id="m1", token_id="t1", outcome="Yes",
            best_bid=Decimal("0.45"), best_ask=Decimal("0.46"),
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

        assert len(received) == 1
        assert received[0].market_id == "m1"

    async def test_multiple_handlers(self, bus: EventBus) -> None:
        results_a: list[str] = []
        results_b: list[str] = []

        async def handler_a(event: PriceUpdateEvent) -> None:
            results_a.append(event.market_id)

        async def handler_b(event: PriceUpdateEvent) -> None:
            results_b.append(event.market_id)

        bus.subscribe(EventType.PRICE_UPDATE, handler_a)
        bus.subscribe(EventType.PRICE_UPDATE, handler_b)

        event = PriceUpdateEvent(
            market_id="m2", token_id="t2", outcome="No",
            best_bid=Decimal("0.50"), best_ask=Decimal("0.51"),
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

        assert results_a == ["m2"]
        assert results_b == ["m2"]

    async def test_no_handlers_does_not_raise(self, bus: EventBus) -> None:
        event = PriceUpdateEvent(
            market_id="m1", token_id="t1", outcome="Yes",
            best_bid=None, best_ask=None,
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

    async def test_handler_isolation_on_error(self, bus: EventBus) -> None:
        """A failing handler must not block other handlers."""
        results: list[str] = []

        async def bad_handler(event: PriceUpdateEvent) -> None:
            raise RuntimeError("intentional failure")

        async def good_handler(event: PriceUpdateEvent) -> None:
            results.append("ok")

        bus.subscribe(EventType.PRICE_UPDATE, bad_handler)
        bus.subscribe(EventType.PRICE_UPDATE, good_handler)

        event = PriceUpdateEvent(
            market_id="m1", token_id="t1", outcome="Yes",
            best_bid=None, best_ask=None,
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

        assert results == ["ok"]


class TestUnsubscribe:
    async def test_unsubscribe_removes_handler(self, bus: EventBus) -> None:
        received = []

        async def handler(event: PriceUpdateEvent) -> None:
            received.append(event)

        bus.subscribe(EventType.PRICE_UPDATE, handler)
        bus.unsubscribe(EventType.PRICE_UPDATE, handler)

        event = PriceUpdateEvent(
            market_id="m1", token_id="t1", outcome="Yes",
            best_bid=None, best_ask=None,
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

        assert len(received) == 0

    async def test_unsubscribe_all(self, bus: EventBus) -> None:
        async def handler(event: PriceUpdateEvent) -> None:
            pass

        bus.subscribe(EventType.PRICE_UPDATE, handler)
        bus.subscribe(EventType.ARB_OPPORTUNITY, handler)
        bus.unsubscribe_all()

        assert bus.handler_count == {}

    async def test_duplicate_subscribe_ignored(self, bus: EventBus) -> None:
        count = []

        async def handler(event: PriceUpdateEvent) -> None:
            count.append(1)

        bus.subscribe(EventType.PRICE_UPDATE, handler)
        bus.subscribe(EventType.PRICE_UPDATE, handler)

        event = PriceUpdateEvent(
            market_id="m1", token_id="t1", outcome="Yes",
            best_bid=None, best_ask=None,
        )
        await bus.publish(EventType.PRICE_UPDATE, event)

        assert len(count) == 1


class TestDiagnostics:
    def test_handler_count(self, bus: EventBus) -> None:
        async def h1(e: PriceUpdateEvent) -> None:
            pass

        async def h2(e: PriceUpdateEvent) -> None:
            pass

        bus.subscribe(EventType.PRICE_UPDATE, h1)
        bus.subscribe(EventType.PRICE_UPDATE, h2)
        bus.subscribe(EventType.ARB_OPPORTUNITY, h1)

        assert bus.handler_count == {"price_update": 2, "arb_opportunity": 1}

    async def test_recent_events_history(self, bus: EventBus) -> None:
        async def noop(e: PriceUpdateEvent) -> None:
            pass

        bus.subscribe(EventType.PRICE_UPDATE, noop)

        for i in range(5):
            event = PriceUpdateEvent(
                market_id=f"m{i}", token_id=f"t{i}", outcome="Yes",
                best_bid=None, best_ask=None,
            )
            await bus.publish(EventType.PRICE_UPDATE, event)

        assert len(bus.recent_events) == 5
        assert bus.recent_events[0][1].market_id == "m0"
        assert bus.recent_events[4][1].market_id == "m4"
