"""FastAPI entrypoint for OpenAI-compatible gateway to 1C.ai"""

from contextlib import asynccontextmanager
import logging
import os
import sys

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler

from .routes_openai import router as openai_router
from .mcp.http_transport import router as mcp_router
from .chat.router import router as chat_router
from .config import get_settings

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # on startup
    logger.info("Starting service Gateway for code.1c.ai")

    # Debug logging for OpenAI API status
    settings = get_settings()
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"OpenAI-compatible API: {'enabled' if settings.OPENAI_COMPAT_API_KEY else 'disabled (OPENAI_COMPAT_API_KEY not set)'}")

    # app.state.onec_client is created lazily in routes
    yield
    # on shutdown
    logger.info("Shutting down gateway")
    client = getattr(app.state, "onec_client", None)
    if client:
        try:
            # Close underlying HTTP client to 1C.ai
            await client.close()
            logger.info("HTTP client closed successfully")
        except Exception as e:
            logger.error(f"Error closing HTTP client: {e}")

app = FastAPI(
    title="Service Gateway for code.1c.ai",
    version="0.1.0",
    description="Exposes endpoints backed by code.1c.ai",
    lifespan=lifespan,
)

# Optional CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Debug middleware to log requests and responses for /v1/chat/completions
@app.middleware("http")
async def log_request_response_middleware(request: Request, call_next):
    try:
        if request.method == "POST" and request.url.path == "/v1/chat/completions":
            # Log request
            body = await request.body()

            if logger.isEnabledFor(logging.DEBUG):
                # Detailed logging: headers + body
                # Redact sensitive headers
                headers = {k.lower(): v for k, v in request.headers.items()}
                if "authorization" in headers:
                    token = headers["authorization"] or ""
                    parts = token.split()
                    headers["authorization"] = (parts[0] + " ****") if len(parts) > 1 else "****"
                if "cookie" in headers:
                    headers["cookie"] = "<redacted>"

                # Truncate long bodies
                preview = body.decode("utf-8", errors="replace")
                max_len = get_settings().LOG_REQUEST_BODY_MAX_LENGTH
                if len(preview) > max_len:
                    preview = preview[:max_len] + "...(truncated)"

                logger.debug(
                    "Incoming POST %s - headers=%s body=%s",
                    request.url.path,
                    headers,
                    preview,
                )
            else:
                # Simple logging: just path
                logger.info("Incoming POST %s", request.url.path)

            # Process request
            response = await call_next(request)

            # Log response
            if logger.isEnabledFor(logging.DEBUG):
                # Read response body
                response_body = b""
                async for chunk in response.body_iterator:
                    response_body += chunk

                # Redact sensitive response headers
                resp_headers = {k.lower(): v for k, v in response.headers.items()}
                if "set-cookie" in resp_headers:
                    resp_headers["set-cookie"] = "<redacted>"

                # Truncate long response bodies
                resp_preview = response_body.decode("utf-8", errors="replace")
                max_len = get_settings().LOG_REQUEST_BODY_MAX_LENGTH
                if len(resp_preview) > max_len:
                    resp_preview = resp_preview[:max_len] + "...(truncated)"

                logger.debug(
                    "Response for POST %s - status=%s headers=%s body=%s",
                    request.url.path,
                    response.status_code,
                    resp_headers,
                    resp_preview,
                )

                # Recreate response with body
                return Response(
                    content=response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )
            else:
                # Simple logging: just status
                logger.info("Response for POST %s - status=%s", request.url.path, response.status_code)
                return response

    except Exception as e:
        logger.warning(f"Request/response middleware failed: {e}")

    return await call_next(request)

# Detailed 422 logging while delegating to default handler
@app.exception_handler(RequestValidationError)
async def handle_validation_exception(request: Request, exc: RequestValidationError):
    try:
        body = await request.body()
        body_preview = body.decode("utf-8", errors="replace")
        max_len = get_settings().LOG_REQUEST_BODY_MAX_LENGTH
        if len(body_preview) > max_len:
            body_preview = body_preview[:max_len] + "...(truncated)"
    except Exception:
        body_preview = "<unavailable>"

    logger.warning(
        "422 validation error on %s %s: errors=%s body=%s",
        request.method,
        str(request.url),
        exc.errors(),
        body_preview,
    )
    return await request_validation_exception_handler(request, exc)

# Mount OpenAI-compatible routes only if API key is configured
settings = get_settings()
if settings.OPENAI_COMPAT_API_KEY:
    app.include_router(openai_router)
    logger.info("OpenAI-compatible API routes mounted")
else:
    logger.debug("OpenAI-compatible API routes disabled (OPENAI_COMPAT_API_KEY not set)")

# Serve Chat UI static assets
app.mount(
    "/chat/static",
    StaticFiles(directory=os.path.join(os.path.dirname(__file__), "chat", "static")),
    name="chat-static",
)
# Mount Chat routes
app.include_router(chat_router)

# Mount MCP Streamable HTTP endpoint
app.include_router(mcp_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

def main():
    """Entry point for the application"""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6002)

if __name__ == "__main__":
    main()