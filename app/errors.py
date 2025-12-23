import logging
import traceback
from typing import Optional

from fastapi.responses import JSONResponse
from .onec_models import ApiError

logger = logging.getLogger(__name__)


def error_response(message: str, err_type: str, status_code: int, code: Optional[int] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": message,
                "type": err_type,
                "code": code if code is not None else status_code,
            }
        },
    )


def map_api_error(err: ApiError) -> JSONResponse:
    """Map ApiError to appropriate HTTP response with logging."""
    sc = err.status_code

    # Log API errors at warning level (expected errors from upstream)
    logger.warning(
        f"API error: {err.message} (status_code={sc})",
        extra={"status_code": sc, "error_type": type(err).__name__}
    )

    if sc in (401, 403):
        return error_response(err.message, "authentication_error", 401)
    if sc == 429:
        return error_response(err.message, "rate_limit_exceeded", 429)
    if sc and sc >= 500:
        return error_response(err.message, "bad_gateway", 502)
    return error_response(err.message, "invalid_request_error", 400)


def map_generic_error(err: Exception) -> JSONResponse:
    """Map unexpected exceptions to 500 error with detailed logging."""
    # Log full exception details for debugging
    logger.error(
        f"Unexpected error: {type(err).__name__}: {str(err)}",
        exc_info=True,
        extra={
            "error_type": type(err).__name__,
            "error_message": str(err),
            "traceback": traceback.format_exc(),
        }
    )

    # Avoid leaking internal details to client
    return error_response("Internal server error", "internal_error", 500)