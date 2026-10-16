"""Polly-Bot exception hierarchy.

All custom exceptions inherit from PollyBotError.
Use specific subclasses to enable targeted error handling.
"""

from typing import Any


class PollyBotError(Exception):
    """Base exception for all Polly-Bot errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


# --- External API Errors ---


class ApiError(PollyBotError):
    """External API call failure (Gamma, CLOB, WebSocket)."""

    def __init__(
        self,
        message: str,
        api_name: str,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, details)
        self.api_name = api_name
        self.status_code = status_code


class GammaApiError(ApiError):
    """Gamma API specific error."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, api_name="gamma", status_code=status_code, details=details)


class ClobApiError(ApiError):
    """CLOB API specific error."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, api_name="clob", status_code=status_code, details=details)


# --- WebSocket Errors ---


class WebSocketError(PollyBotError):
    """WebSocket connection or message error."""

    pass


class WebSocketConnectionError(WebSocketError):
    """Failed to establish or maintain WebSocket connection."""

    pass


class WebSocketSubscriptionError(WebSocketError):
    """Failed to subscribe to a WebSocket channel."""

    pass


# --- Arbitrage Errors ---


class ArbitrageError(PollyBotError):
    """Arbitrage calculation or detection error."""

    pass


class InsufficientLiquidityError(ArbitrageError):
    """Order book depth is insufficient for the desired trade size."""

    def __init__(
        self,
        message: str,
        required_size: float,
        available_size: float,
        token_id: str | None = None,
    ) -> None:
        super().__init__(
            message,
            details={
                "required_size": required_size,
                "available_size": available_size,
                "token_id": token_id,
            },
        )
        self.required_size = required_size
        self.available_size = available_size


class StaleDataError(ArbitrageError):
    """Price data is too old to safely execute a trade."""

    def __init__(self, message: str, age_seconds: float, max_age_seconds: float) -> None:
        super().__init__(
            message,
            details={"age_seconds": age_seconds, "max_age_seconds": max_age_seconds},
        )


# --- Execution Errors ---


class ExecutionError(PollyBotError):
    """Order execution failure."""

    pass


class OrderRejectedError(ExecutionError):
    """Order was rejected by the exchange."""

    def __init__(self, message: str, order_id: str | None = None, reason: str | None = None):
        super().__init__(message, details={"order_id": order_id, "reason": reason})


class PartialFillError(ExecutionError):
    """Order was only partially filled."""

    def __init__(self, message: str, filled: float, requested: float):
        super().__init__(message, details={"filled": filled, "requested": requested})


# --- NegRisk Specific ---


class NegRiskError(PollyBotError):
    """NegRisk conversion or adapter error."""

    pass


class NegRiskConversionError(NegRiskError):
    """Failed to convert NO tokens via NegRisk adapter."""

    pass


class NegRiskMergeError(NegRiskError):
    """Failed to merge YES+NO tokens."""

    pass
