from __future__ import annotations

import os
import json
import logging
from typing import Optional, AsyncGenerator, Dict, Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from ..onec_client import OneCApiClient
from ..streaming import sanitize_text
from ..onec_models import ApiError, ConversationSession
from ..token_counter import count_tokens
from ..config import get_settings
from ..text_utils import prepare_message_for_upstream

logger = logging.getLogger(__name__)

router = APIRouter()

# Paths to static assets
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
INDEX_HTML = os.path.join(STATIC_DIR, "index.html")


def _get_client(req: Request) -> OneCApiClient:
    client = getattr(req.app.state, "onec_client", None)
    if client is None:
        client = OneCApiClient()
        req.app.state.onec_client = client
    return client


@router.get("/chat")
async def chat_page():
    return FileResponse(INDEX_HTML, media_type="text/html")


@router.get("/chat/api/config")
async def chat_config():
    """
    Returns chat configuration settings for the frontend.
    """
    settings = get_settings()
    return {
        "max_attached_files_size_kb": settings.MAX_ATTACHED_FILES_SIZE_KB
    }


class SendRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    create_new_session: Optional[bool] = False
    programming_language: Optional[str] = None
    parent_uuid: Optional[str] = None


@router.post("/chat/api/send")
async def chat_send(request: Request, body: SendRequest):
    """
    Non-streaming chat API: returns full answer once complete.
    """
    client = _get_client(request)
    settings = get_settings()

    try:
        if body.create_new_session or not (body.conversation_id or "").strip():
            conv_id = await client.get_or_create_session(
                create_new=True, programming_language=body.programming_language
            )
        else:
            conv_id = body.conversation_id.strip()

        # Гарантировать что сессия существует
        if conv_id not in client.sessions:
            client.sessions[conv_id] = ConversationSession(conversation_id=conv_id)

        # Apply global input length limit
        prepared_message, was_truncated = prepare_message_for_upstream(body.message, settings)
        if was_truncated:
            logger.warning(
                f"Message truncated from {len(body.message)} to {len(prepared_message)} characters"
            )

        answer = await client.send_message_full(conv_id, prepared_message, body.parent_uuid)
        return {
            "conversation_id": conv_id,
            "answer": sanitize_text(answer or ""),
        }
    except ApiError as e:
        return JSONResponse(
            status_code=502,
            content={"error": {"message": e.message, "status_code": e.status_code}},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": {"message": "Internal server error"}},
        )


def _sse_event(event: str, data: Dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


class StreamRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    create_new_session: Optional[bool] = False
    programming_language: Optional[str] = None
    parent_uuid: Optional[str] = None


class FeedbackRequest(BaseModel):
    message_id: str
    score: int  # 1 for like, -1 for dislike


@router.post("/chat/api/stream")
async def chat_stream(
    request: Request,
    body: StreamRequest,
):
    """
    Streaming chat API via SSE.
    Events:
      - meta: {"conversation_id": "..."} (first event)
      - delta: {"text": "<delta>"} (one or more)
      - done: {}
      - error: {"message": "..."} (optional)
    """
    client = _get_client(request)
    settings = get_settings()

    async def gen() -> AsyncGenerator[bytes, None]:
        try:
            # Resolve conversation id
            if body.create_new_session or not (body.conversation_id or "").strip():
                conv_id = await client.get_or_create_session(
                    create_new=True, programming_language=body.programming_language
                )
            else:
                conv_id = (body.conversation_id or "").strip()

            # Гарантировать что сессия существует
            if conv_id not in client.sessions:
                client.sessions[conv_id] = ConversationSession(conversation_id=conv_id)

            # Send meta with conversation id
            yield _sse_event("meta", {"conversation_id": conv_id})

            # Apply global input length limit
            prepared_message, was_truncated = prepare_message_for_upstream(body.message, settings)
            if was_truncated:
                logger.warning(
                    f"Message truncated from {len(body.message)} to {len(prepared_message)} characters"
                )

            # Count input tokens
            input_tokens = count_tokens(prepared_message)

            # Stream upstream "full_so_far" into deltas
            # Note: Upstream API sometimes RESTARTS the response from beginning mid-stream (bug on their side)
            prev_raw = ""
            current_message_id = None
            async for update in client.iter_message_stream(conv_id, prepared_message, body.parent_uuid):
                raw_text = update.get("text") or ""
                finished = bool(update.get("finished"))
                message_id = update.get("message_id")

                # Store message_id for feedback functionality
                if message_id and not current_message_id:
                    current_message_id = message_id

                # Skip if unchanged
                if raw_text == prev_raw:
                    continue

                # Calculate delta from RAW text (already cleaned by onec_client)
                if not prev_raw:
                    # First chunk - send everything
                    delta_raw = raw_text
                elif raw_text.startswith(prev_raw):
                    # Normal case: cumulative text extended
                    delta_raw = raw_text[len(prev_raw):]
                else:
                    # Text doesn't start with previous - upstream restarted OR text modified mid-stream
                    # Log first/last 100 chars for debugging
                    logger.debug(
                        f"Upstream text mismatch: prev_len={len(prev_raw)}, new_len={len(raw_text)}, "
                        f"prev_start='{prev_raw[:100]}...', new_start='{raw_text[:100]}...'"
                    )
                    # Send special "reset" event to tell client to clear previous text
                    yield _sse_event("reset", {})
                    delta_raw = raw_text

                prev_raw = raw_text

                # Sanitize and send
                if delta_raw:
                    delta = sanitize_text(delta_raw)
                    if delta:
                        # Include message_id in delta event for feedback functionality
                        yield _sse_event("delta", {
                            "text": delta,
                            "message_id": current_message_id
                        })

                if finished:
                    break

            # Count output tokens from final response
            output_tokens = count_tokens(prev_raw) if prev_raw else 0
            total_tokens = input_tokens + output_tokens

            # Send token statistics before done event
            yield _sse_event("tokens", {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens
            })

            # Signal completion
            yield _sse_event("done", {})

        except ApiError as e:
            yield _sse_event("error", {"message": e.message, "status_code": e.status_code})
            yield _sse_event("done", {})
        except Exception:
            yield _sse_event("error", {"message": "Internal server error"})
            yield _sse_event("done", {})

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(gen(), media_type="text/event-stream; charset=utf-8", headers=headers)


@router.post("/chat/api/feedback")
async def chat_feedback(request: Request, body: FeedbackRequest):
    """
    Send feedback (like/dislike) for a message.
    """
    client = _get_client(request)

    try:
        await client.send_feedback(body.message_id, body.score)
        return {"success": True, "message_id": body.message_id, "score": body.score}
    except ApiError as e:
        logger.error(f"Feedback API error: {e.message}")
        return JSONResponse(
            status_code=502,
            content={"error": {"message": e.message, "status_code": e.status_code}},
        )
    except Exception as e:
        logger.error(f"Unexpected feedback error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": {"message": "Internal server error"}},
        )