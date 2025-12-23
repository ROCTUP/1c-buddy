"""Utilities to transform 1C.ai SSE into OpenAI-compatible streaming chunks."""

import json
import logging
import time
import unicodedata
import re
from typing import AsyncGenerator, Dict, Any, Optional

logger = logging.getLogger(__name__)


def sanitize_text(text: str) -> str:
    """Normalize unicode and remove control chars except \n, \r, \t."""
    if not text:
        return text
    text = unicodedata.normalize("NFKC", text)
    cleaned = []
    for ch in text:
        if unicodedata.category(ch) not in ("Cc", "Cf") or ch in ("\n", "\r", "\t"):
            cleaned.append(ch)
    return "".join(cleaned)


def _chunk_payload(
    chunk_id: str,
    model: str,
    created: int,
    delta_content: Optional[str] = None,
    delta_role: Optional[str] = None,
    finish_reason: Optional[str] = None,
) -> Dict[str, Any]:
    delta: Dict[str, Any] = {}
    if delta_role is not None:
        delta["role"] = delta_role
    if delta_content is not None:
        delta["content"] = delta_content

    return {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }


def _sse_encode(obj: Dict[str, Any]) -> bytes:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode("utf-8")


def _sse_done() -> bytes:
    return b"data: [DONE]\n\n"


def _ensure_wellformed_operations(text: str) -> str:
    """
    Best-effort fix for partially truncated XML-like tool blocks expected by KiloCode:
      <ask_followup_question>, <follow_up>, <suggest>, <attempt_completion>, <result>, <question>
    If the upstream stopped mid-stream, close any missing end-tags so the client parser doesn't fail.
    Idempotent: if tags are already balanced, text is returned unchanged.
    """
    try:
        if not isinstance(text, str):
            return text

        # Only attempt fixes when we see our operations tags
        if all(t not in text for t in ("<ask_followup_question", "<attempt_completion", "<suggest>", "<follow_up>", "<question>", "<result>")):
            return text

        def fix_tag(name: str, s: str) -> str:
            open_count = len(re.findall(rf"<{name}\b", s))
            close_count = len(re.findall(rf"</{name}>", s))
            if close_count < open_count:
                s = s + ("</" + name + ">") * (open_count - close_count)
            return s

        # Close inner tags first, then outer containers
        text = fix_tag("suggest", text)
        text = fix_tag("question", text)
        text = fix_tag("result", text)
        text = fix_tag("follow_up", text)
        text = fix_tag("ask_followup_question", text)
        text = fix_tag("attempt_completion", text)

        return text
    except Exception:
        # Be conservative on any error
        return text


def _ensure_openai_tool_contract(text: str) -> str:
    """
    Ensure the stream contains exactly one tool block expected by KiloCode client.
    - If text already contains XML tags (tools), return as-is.
    - Otherwise, wrap the entire text into a single attempt_completion with CDATA to avoid XML parse errors.
    """
    try:
        if not isinstance(text, str):
            return "<attempt_completion><result><![CDATA[]]></result></attempt_completion>"
        stripped = text.strip()
        if not stripped:
            return "<attempt_completion><result><![CDATA[]]></result></attempt_completion>"
        # Check if text contains ANY XML tags (indication of tool blocks or pseudo-XML)
        if re.search(r"<\w+[\s/>]", stripped):
            return text
        return _wrap_attempt_completion(text)
    except Exception:
        return text

def _escape_cdata(s: str) -> str:
    """
    CDATA cannot contain the sequence ']]>'.
    Replace any ']]>' with a safe split that closes and reopens CDATA.
    """
    return (s or "").replace("]]>", "]]]]><![CDATA[>")

def _wrap_attempt_completion(body: str) -> str:
    """
    Wrap arbitrary text into a single attempt_completion tool block using CDATA.
    """
    safe = _escape_cdata(body or "")
    return f"<attempt_completion><result><![CDATA[{safe}]]></result></attempt_completion>"


async def openai_stream_from_upstream(
    model: str,
    upstream: AsyncGenerator[Dict[str, Any], None],
    request_id: str,
    kilocode_mode: bool = False,
) -> AsyncGenerator[bytes, None]:
    """
    Bridge upstream SSE ('text' = full_so_far, 'finished' flag) into OpenAI chat.completion.chunk stream.

    Behavior:
    - Always emit initial role delta.
    - If kilocode_mode=True: buffer entire text and send a single final delta after XML fixing/wrapping.
    - If kilocode_mode=False: emit incremental content deltas as the upstream grows (like OpenAI).
    """
    created = int(time.time())
    # Initial assistant role chunk (per OpenAI)
    yield _sse_encode(
        _chunk_payload(
            chunk_id=request_id,
            model=model,
            created=created,
            delta_role="assistant",
        )
    )

    if kilocode_mode:
        # KiloCode VSCode compatibility: buffer to avoid partial XML blocks mid-stream
        full_raw = ""
        async for update in upstream:
            raw_text = update.get("text") or ""
            if raw_text:
                full_raw = raw_text  # upstream provides cumulative text
            if bool(update.get("finished")):
                break

        final_text = sanitize_text(full_raw)
        # Fix incomplete tool-XML if any, and guarantee single block
        final_text = _ensure_wellformed_operations(final_text)
        final_text = _ensure_openai_tool_contract(final_text)

        if final_text:
            yield _sse_encode(
                _chunk_payload(
                    chunk_id=request_id,
                    model=model,
                    created=created,
                    delta_content=final_text,
                )
            )
    else:
        # Standard OpenAI clients: emit incremental deltas
        prev_raw = ""
        async for update in upstream:
            raw_text = update.get("text") or ""
            finished = bool(update.get("finished"))

            if raw_text:
                if not prev_raw:
                    delta_raw = raw_text
                elif raw_text.startswith(prev_raw):
                    delta_raw = raw_text[len(prev_raw):]
                else:
                    # Upstream text diverged (restart/rewrite). Emit only the non-overlapping suffix.
                    max_overlap = min(len(prev_raw), len(raw_text))
                    overlap = 0
                    for i in range(max_overlap, 0, -1):
                        if prev_raw[-i:] == raw_text[:i]:
                            overlap = i
                            break
                    delta_raw = raw_text[overlap:]

                prev_raw = raw_text

                delta = sanitize_text(delta_raw)
                if delta:
                    yield _sse_encode(
                        _chunk_payload(
                            chunk_id=request_id,
                            model=model,
                            created=created,
                            delta_content=delta,
                        )
                    )

            if finished:
                break

    # Final control chunk with finish reason and empty delta
    yield _sse_encode(
        _chunk_payload(
            chunk_id=request_id,
            model=model,
            created=created,
            finish_reason="stop",
        )
    )

    # Stream terminator
    yield _sse_done()
