import time
import uuid
import re
from typing import Optional, Dict, Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse

from .config import get_settings, check_gateway_api_key
from .openai_models import (
    ModelList,
    ModelData,
    ChatCompletionsRequest,
    ChatCompletion,
    ChatChoice,
    ChatMessageResponse,
    Usage,
)
from .streaming import sanitize_text, openai_stream_from_upstream
from .onec_client import OneCApiClient
from .errors import error_response, map_api_error, map_generic_error
from .onec_models import ApiError
from .text_utils import prepare_message_for_upstream

import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_client(req: Request) -> OneCApiClient:
    client = getattr(req.app.state, "onec_client", None)
    if client is None:
        client = OneCApiClient()
        req.app.state.onec_client = client
    return client


def _auth_guard(req: Request) -> Optional[JSONResponse]:
    s = get_settings()
    auth = req.headers.get("authorization")
    if not check_gateway_api_key(auth, s):
        return error_response("Invalid or missing API key", "authentication_error", 401)
    return None


def _is_kilocode_client(req: Request) -> bool:
    """Detect if request is from KiloCode VSCode extension."""
    # Check for KiloCode-specific headers
    if req.headers.get("x-kilocode-version"):
        return True
    # Check user-agent for KiloCode
    user_agent = req.headers.get("user-agent", "").lower()
    if "kilo-code" in user_agent or "kilocode" in user_agent:
        return True
    return False


@router.get("/v1/models", response_model=ModelList)
async def list_models(request: Request):
    if (resp := _auth_guard(request)) is not None:
        return resp

    settings = get_settings()
    created = int(time.time())
    return ModelList(
        object="list",
        data=[ModelData(id=settings.PUBLIC_MODEL_ID, created=created)],
    )


def _extract_instruction(body: ChatCompletionsRequest) -> Optional[str]:
    # Convert OpenAI content (string or array-of-parts) into plain text
    def to_text(content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    # OpenAI content part: prefer 'text'
                    t = item.get("text")
                    if isinstance(t, str):
                        parts.append(t)
                else:
                    parts.append(str(item))
            return "\n".join([p for p in parts if p])
        # Fallback for unexpected types
        return str(content)

    system_parts = [to_text(m.content) for m in body.messages if m.role == "system"]
    user_msgs = [to_text(m.content) for m in body.messages if m.role == "user"]

    if not user_msgs:
        return None

    user_last = (user_msgs[-1] or "").strip()
    preface = "\n\n".join([p for p in system_parts if (p or "").strip()]).strip()

    if preface:
        return f"{preface}\n\n{user_last}"
    return user_last


def _extract_metadata(body: ChatCompletionsRequest, request: Request) -> Dict[str, Any]:
    meta = body.metadata or {}
    headers = request.headers

    conv_id = headers.get("x-1c-conversation-id") or meta.get("conversation_id")
    create_new_header = headers.get("x-1c-create-new-session", "")
    create_new = meta.get("create_new_session")
    # Interpret header truthy strings
    if isinstance(create_new_header, str) and create_new_header:
        create_new = create_new or create_new_header.strip().lower() in ("1", "true", "yes", "y")

    programming_language = meta.get("programming_language")

    return {
        "conversation_id": conv_id,
        "create_new_session": bool(create_new),
        "programming_language": programming_language if programming_language else None,
    }

def _ensure_wellformed_operations(text: str) -> str:
    """
    Best-effort fix for partially truncated XML tool blocks from upstream.
    Specifically targets tags used by KiloCode VSCode (<ask_followup_question>, <follow_up>, <suggest>, <attempt_completion>).
    If upstream ended mid-stream without 'finished', we may return incomplete XML; this closes missing tags to avoid client parse errors.
    """
    try:
        if not isinstance(text, str):
            return text

        # Only run if we detect possible operations blocks
        if ("<ask_followup_question" not in text) and ("<attempt_completion" not in text):
            return text

        def fix_tag(name: str, s: str) -> str:
            open_count = len(re.findall(rf"<{name}\b", s))
            close_count = len(re.findall(rf"</{name}>", s))
            if close_count < open_count:
                s = s + ("</" + name + ">") * (open_count - close_count)
            return s

        # Close inner-most tags first
        text = fix_tag("suggest", text)
        text = fix_tag("follow_up", text)
        # question is a leaf node inside ask_followup_question; ensure closure if present without end
        text = fix_tag("question", text)
        # Top-level ops
        text = fix_tag("ask_followup_question", text)
        # attempt_completion path
        text = fix_tag("result", text)
        text = fix_tag("attempt_completion", text)

        return text
    except Exception:
        # On any parsing/regex error, return original text unmodified
        return text

def _ensure_openai_tool_contract(text: str) -> str:
    """
    Ensure the response contains exactly one tool block expected by KiloCode client.
    - If text already contains XML tags (tools), return as-is.
    - Otherwise, wrap the entire text into a single attempt_completion using CDATA to avoid XML parse errors.
    """
    try:
        if not isinstance(text, str) or not text.strip():
            return "<attempt_completion><result><![CDATA[]]></result></attempt_completion>"

        # Check if text contains ANY XML tags (indication of tool blocks or pseudo-XML)
        if re.search(r"<\w+[\s/>]", text):
            return text

        # Wrap plain answer into an attempt_completion tool call using CDATA and escaping ']]>'
        safe = (text or "").replace("]]>", "]]]]><![CDATA[>")
        return f"<attempt_completion><result><![CDATA[{safe}]]></result></attempt_completion>"
    except Exception:
        return text


@router.post("/v1/chat/completions")
async def chat_completions(request: Request, body: ChatCompletionsRequest, response: Response):
    if (resp := _auth_guard(request)) is not None:
        return resp

    settings = get_settings()
    client = _get_client(request)
    model_id = body.model or settings.PUBLIC_MODEL_ID

    instruction = _extract_instruction(body)
    if not instruction:
        return error_response("messages must include at least one user message", "invalid_request_error", 400)

    # Apply global input length limit
    prepared_instruction, was_truncated = prepare_message_for_upstream(instruction, settings)
    if was_truncated:
        logger.warning(
            f"OpenAI API message truncated from {len(instruction)} to {len(prepared_instruction)} characters"
        )

    meta = _extract_metadata(body, request)
    conversation_id: Optional[str] = meta["conversation_id"]
    create_new_session: bool = meta["create_new_session"]
    programming_language: Optional[str] = meta["programming_language"]

    try:
        # Determine conversation to use
        if create_new_session or not conversation_id:
            # For OpenAI API: always create new session if conversation_id not provided
            # This ensures each request without explicit conversation_id gets fresh context
            conversation_id = await client.get_or_create_session(
                create_new=True,
                programming_language=programming_language,
            )
        else:
            # If conversation_id provided, client will lazily ensure local session state
            pass

        if body.stream:
            request_id = f"chatcmpl-{uuid.uuid4().hex}"

            upstream = client.iter_message_stream(conversation_id, prepared_instruction)

            # Detect if client is KiloCode
            is_kilocode = _is_kilocode_client(request)

            async def gen():
                try:
                    async for chunk in openai_stream_from_upstream(
                        model=model_id,
                        upstream=upstream,
                        request_id=request_id,
                        kilocode_mode=is_kilocode
                    ):
                        yield chunk
                except ApiError as e:
                    # Cannot change headers mid-stream; terminate stream
                    # by sending a final DONE. Client should handle disconnect.
                    # Optionally, one could encode an error chunk, but OpenAI
                    # spec usually closes connection on errors.
                    yield b"data: [DONE]\n\n"
                except Exception:
                    yield b"data: [DONE]\n\n"

            headers = {
                "X-1C-Conversation-Id": conversation_id,
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
            return StreamingResponse(
                gen(),
                media_type="text/event-stream; charset=utf-8",
                headers=headers,
            )

        # Non-stream path
        final_text = await client.send_message_full(conversation_id, prepared_instruction)
        final_text = sanitize_text(final_text)

        # Apply KiloCode XML wrapping only for KiloCode clients
        is_kilocode = _is_kilocode_client(request)
        if is_kilocode:
            # For KiloCode: fix incomplete tool tags, preserve existing tool blocks
            final_text = _ensure_wellformed_operations(final_text)
            final_text = _ensure_openai_tool_contract(final_text)

        comp_id = f"chatcmpl-{uuid.uuid4().hex}"
        created = int(time.time())

        completion = ChatCompletion(
            id=comp_id,
            created=created,
            model=model_id,
            choices=[
                ChatChoice(
                    index=0,
                    message=ChatMessageResponse(content=final_text),
                    finish_reason="stop",
                )
            ],
            usage=Usage(prompt_tokens=0, completion_tokens=0, total_tokens=0),
        )

        response.headers["X-1C-Conversation-Id"] = conversation_id
        return completion

    except ApiError as e:
        return map_api_error(e)
    except Exception as e:
        return map_generic_error(e)
