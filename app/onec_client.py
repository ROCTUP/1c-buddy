"""Async HTTP client for 1C.ai with session management and SSE streaming."""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, AsyncGenerator, Dict, Any

import httpx

from .config import get_settings, Settings
from .onec_models import (
    ConversationRequest,
    ConversationResponse,
    MessageRequest,
    MessageChunk,
    ConversationSession,
    ApiError,
    ToolResultItem,
    ToolResultRequest,
)

logger = logging.getLogger(__name__)


class OneCApiClient:
    """Client to interact with 1C.ai chat API over SSE."""

    def __init__(self, settings: Optional[Settings] = None):
        self.settings: Settings = settings or get_settings()
        self.base_url = self.settings.ONEC_AI_BASE_URL.rstrip("/")
        self.sessions: Dict[str, ConversationSession] = {}

        # Create async HTTP client
        # Use infinite read timeout for SSE, while keeping bounded connect/write/pool timeouts
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=self.settings.ONEC_AI_TIMEOUT,
                read=None,
                write=self.settings.ONEC_AI_TIMEOUT,
                pool=self.settings.ONEC_AI_TIMEOUT,
            ),
            headers={
                "Accept": "*/*",
                "Accept-Charset": "utf-8",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "ru-ru,en-us;q=0.8,en;q=0.7",
                "Authorization": self.settings.ONEC_AI_TOKEN,
                "Content-Type": "application/json; charset=utf-8",
                "Origin": self.settings.ONEC_AI_BASE_URL,
                "Referer": f"{self.settings.ONEC_AI_BASE_URL}/chat/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/620.1 (KHTML, like Gecko) JavaFX/22 Safari/620.1",
            },
        )

    async def create_conversation(
        self,
        programming_language: Optional[str] = None,
    ) -> str:
        """Create a new conversation and track it in sessions."""
        try:
            request_data = ConversationRequest(
                is_chat=True,
                skill_name="custom",
                ui_language=self.settings.ONEC_AI_UI_LANGUAGE,
                programming_language=programming_language
                or self.settings.ONEC_AI_PROGRAMMING_LANGUAGE,
            )

            url = f"{self.base_url}/chat_api/v1/conversations/"
            payload = request_data.model_dump()
            request_headers = {"Session-Id": ""}

            if logger.isEnabledFor(logging.DEBUG):
                # Redact sensitive headers for logging
                safe_headers = {k: ("****" if k.lower() == "authorization" else v)
                               for k, v in {**self.client.headers, **request_headers}.items()}
                logger.debug(
                    "Creating conversation at %s - headers=%s payload=%s",
                    url,
                    safe_headers,
                    payload
                )
            else:
                logger.info("Creating new conversation")

            resp = await self.client.post(
                url,
                json=payload,
                headers=request_headers,
            )

            if resp.status_code != 200:
                raise ApiError(
                    f"Conversation create error: {resp.status_code}", resp.status_code
                )

            conv = ConversationResponse(**resp.json())
            conversation_id = conv.uuid

            self.sessions[conversation_id] = ConversationSession(
                conversation_id=conversation_id
            )

            if logger.isEnabledFor(logging.DEBUG):
                resp_headers = dict(resp.headers)
                resp_body = resp.json()
                logger.debug(
                    "Conversation created - status=%s headers=%s body=%s",
                    resp.status_code,
                    resp_headers,
                    resp_body
                )
            else:
                logger.info(f"Created new conversation: {conversation_id}")

            return conversation_id

        except httpx.RequestError as e:
            raise ApiError(f"Network error creating conversation: {str(e)}")
        except ApiError:
            raise
        except Exception as e:
            raise ApiError(f"Unexpected error creating conversation: {str(e)}")

    async def iter_message_stream(
        self, conversation_id: str, message: str, parent_uuid: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Send a message and yield streaming updates.
        Yields dicts:
          {"text": str, "reasoning_delta": str, "finished": bool, "message_id": str}
          {"tool_call": {"tool_call_id": str, "tool_name": str, "request_markdown": str}}
          {"tool_result": {"tool_call_id": str, "tool_name": str, "response_markdown": str,
                            "response_details": list, "hide_after": bool}}
          {"tool_followup": {"tool_call_id": str, "text": str}}
        """
        try:
            # Ensure session exists
            if conversation_id not in self.sessions:
                self.sessions[conversation_id] = ConversationSession(
                    conversation_id=conversation_id
                )

            session = self.sessions[conversation_id]
            session.update_usage()

            # Fallback parent_uuid to last known assistant uuid from session
            if parent_uuid is None and session.last_message_uuid:
                parent_uuid = session.last_message_uuid
                logger.debug(f"Using session.last_message_uuid as parent_uuid: {parent_uuid}")
            else:
                logger.debug(f"parent_uuid from request: {parent_uuid}")

            url = f"{self.base_url}/chat_api/v1/conversations/{conversation_id}/messages"
            request_headers = {"Accept": "text/event-stream"}

            # First payload: user message
            request_data = MessageRequest.from_instruction(message, parent_uuid=parent_uuid)
            payload = request_data.model_dump()

            # last_sent_tool_calls хранится МЕЖДУ итерациями while — для per-item fallback
            last_sent_tool_calls: list = []
            assistant_segments: list[str] = []
            visible_text = ""

            def build_visible_text(current_round_text: str) -> str:
                prefix = "\n\n".join(assistant_segments).strip()
                current = (current_round_text or "").strip()
                if prefix and current:
                    return f"{prefix}\n\n{current}"
                if prefix:
                    return prefix
                if current:
                    return current
                return ""

            def append_assistant_segment(segment_text: str) -> str:
                segment = (segment_text or "").strip()
                if not segment:
                    return build_visible_text("")
                if assistant_segments and assistant_segments[-1] == segment:
                    return build_visible_text("")
                assistant_segments.append(segment)
                return build_visible_text("")

            while True:
                if logger.isEnabledFor(logging.DEBUG):
                    safe_headers = {k: ("****" if k.lower() == "authorization" else v)
                                   for k, v in {**self.client.headers, **request_headers}.items()}
                    logger.debug(
                        "POST upstream %s - conversation_id=%s payload=%s",
                        url, conversation_id,
                        json.dumps(payload, ensure_ascii=False)[:500]
                    )
                else:
                    logger.info("POST upstream - conversation_id=%s role=%s",
                                conversation_id, payload.get("role", "user"))

                async with self.client.stream(
                    "POST", url, json=payload, headers=request_headers,
                ) as response:
                    if response.status_code != 200:
                        raise ApiError(
                            f"Message send error: {response.status_code}",
                            response.status_code,
                        )

                    response.encoding = "utf-8"
                    accumulated_text = ""
                    accumulated_reasoning = ""
                    cleaned_text = ""
                    cleaned_reasoning = ""
                    tool_calls_pending: list = []
                    buffered_text_updates: list[dict[str, Any]] = []

                    try:
                        async for line in response.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue

                            data_str = line[6:]
                            try:
                                data = json.loads(data_str)
                            except (json.JSONDecodeError, Exception) as e:
                                logger.warning(f"SSE parse error: {e}")
                                continue

                            try:
                                chunk = MessageChunk(**data)
                            except Exception as e:
                                logger.warning(f"SSE chunk model error: {e}")
                                continue

                            # --- Tool echo (role=tool): per-item ri_by_id с fallback ---
                            if chunk.role == "tool" and chunk.finished:
                                ri_by_id = {
                                    ri["tool_call_id"]: ri
                                    for ri in (chunk.render_info or [])
                                    if isinstance(ri, dict) and "tool_call_id" in ri
                                }
                                for tc in last_sent_tool_calls:
                                    tc_id = tc.get("id", "")
                                    ri = ri_by_id.get(tc_id, {})
                                    func = tc.get("function", {})
                                    yield {
                                        "tool_result": {
                                            "tool_call_id": tc_id,
                                            "tool_name": ri.get("tool_name") or func.get("name", ""),
                                            "response_markdown": ri.get("response_markdown") or "✓ Инструмент выполнен",
                                            "response_details": (ri.get("details") or {}).get("response_details") or [],
                                            "hide_after": ri.get("hide_after", True),
                                        }
                                    }
                                continue

                            # --- Пропускаем user echo ---
                            if chunk.role == "user" and chunk.finished:
                                logger.debug("Received user message echo, skipping")
                                continue

                            # --- Извлечение текста и reasoning ---
                            is_delta_format = False
                            raw_text = ""
                            reasoning_delta = ""

                            if chunk.content and chunk.content.get("content") is not None:
                                raw_text = chunk.content["content"]
                                is_delta_format = False
                            elif chunk.content_delta and chunk.content_delta.content is not None:
                                raw_text = chunk.content_delta.content
                                is_delta_format = True

                            if chunk.content_delta and chunk.content_delta.reasoning_content is not None:
                                reasoning_delta = chunk.content_delta.reasoning_content

                            # Проверяем наличие tool_calls в этом чанке
                            has_tool_calls = bool((chunk.content or {}).get("tool_calls"))

                            if (raw_text or reasoning_delta) and (chunk.role == "assistant" or chunk.content_delta):
                                if is_delta_format:
                                    accumulated_text += raw_text
                                    final_text = accumulated_text
                                else:
                                    final_text = raw_text

                                accumulated_reasoning += reasoning_delta

                                cleaned_text = final_text.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
                                cleaned_reasoning = reasoning_delta.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")

                                logger.debug(
                                    f"[UPSTREAM] format={'delta' if is_delta_format else 'cumulative'}, "
                                    f"chunk_len={len(raw_text)}, total_len={len(cleaned_text)}, "
                                    f"reasoning_len={len(reasoning_delta)}, has_tool_calls={has_tool_calls}"
                                )

                                # Reasoning отдаём сразу, но с текущим visible_text, чтобы
                                # не ломать монотонный текстовый контракт стрима.
                                if cleaned_reasoning:
                                    yield {
                                        "text": visible_text,
                                        "reasoning_delta": cleaned_reasoning,
                                        "finished": False,
                                        "message_id": chunk.uuid,
                                    }

                                if cleaned_text:
                                    buffered_text_updates.append(
                                        {
                                            "text": cleaned_text,
                                            "reasoning_delta": "",
                                            "finished": bool(chunk.finished),
                                            "message_id": chunk.uuid,
                                        }
                                    )
                                    current_round_text = buffered_text_updates[-1]["text"]
                                    candidate_visible_text = build_visible_text(current_round_text)
                                    if candidate_visible_text != visible_text:
                                        visible_text = candidate_visible_text
                                        yield {
                                            "text": visible_text,
                                            "reasoning_delta": "",
                                            "finished": False,
                                            "message_id": chunk.uuid,
                                        }

                            # --- Финальный ассистентский чанк ---
                            if chunk.finished and chunk.role == "assistant":
                                session.last_message_uuid = chunk.uuid
                                logger.debug(f"Saved last_message_uuid: {chunk.uuid}")
                                logger.debug(f"[UPSTREAM FINAL TEXT]:\n{cleaned_text}")

                                tc_list = (chunk.content or {}).get("tool_calls") or []
                                if tc_list:
                                    round_text = buffered_text_updates[-1].get("text") if buffered_text_updates else ""
                                    append_assistant_segment(round_text)
                                    new_visible_text = build_visible_text("")
                                    if new_visible_text != visible_text:
                                        visible_text = new_visible_text
                                        yield {
                                            "text": visible_text,
                                            "reasoning_delta": "",
                                            "finished": False,
                                            "message_id": chunk.uuid,
                                        }

                                    # Есть tool calls — формируем события для UI
                                    tool_calls_pending = tc_list
                                    buffered_text_updates = []
                                    ri_by_id = {
                                        ri["tool_call_id"]: ri
                                        for ri in (chunk.render_info or [])
                                        if isinstance(ri, dict) and "tool_call_id" in ri
                                    }
                                    for tc in tc_list:
                                        tc_id = tc.get("id", "")
                                        ri = ri_by_id.get(tc_id, {})
                                        func = tc.get("function", {})
                                        req_md = (ri.get("request_markdown") or
                                                  f"`{func.get('name', '?')}({func.get('arguments', '')})`")
                                        yield {
                                            "tool_call": {
                                                "tool_call_id": tc_id,
                                                "tool_name": ri.get("tool_name") or func.get("name", ""),
                                                "request_markdown": req_md,
                                            }
                                        }
                                else:
                                    # Финальный round уже стримился в реальном времени.
                                    # Здесь только добиваем последнее состояние и завершаем поток.
                                    current_round_text = buffered_text_updates[-1].get("text") if buffered_text_updates else ""
                                    final_visible_text = build_visible_text(current_round_text)
                                    if final_visible_text != visible_text:
                                        visible_text = final_visible_text
                                        yield {
                                            "text": visible_text,
                                            "reasoning_delta": "",
                                            "finished": False,
                                            "message_id": chunk.uuid,
                                        }
                                    yield {
                                        "text": visible_text,
                                        "reasoning_delta": "",
                                        "finished": True,
                                        "message_id": chunk.uuid,
                                    }
                                break

                    except (GeneratorExit, asyncio.CancelledError):
                        logger.debug("Stream cancelled or client disconnected")
                        logger.debug(f"[UPSTREAM FINAL TEXT (on disconnect)]:\n{cleaned_text}")
                        raise

                # Выходим если нет tool_calls
                if not tool_calls_pending:
                    break

                # Сохраняем ДО очистки — нужны для fallback в следующем round-trip
                last_sent_tool_calls = list(tool_calls_pending)
                # Подготавливаем tool result POST
                payload = self._build_tool_result_payload(
                    tool_calls_pending, session.last_message_uuid
                )
                tool_calls_pending = []

        except httpx.RequestError as e:
            raise ApiError(f"Network error sending message: {str(e)}")
        except ApiError:
            raise
        except Exception as e:
            raise ApiError(f"Unexpected error sending message: {str(e)}")


    async def send_message_full(self, conversation_id: str, message: str, parent_uuid: Optional[str] = None) -> str:
        """Send a message and return the final full text."""
        final_text = ""
        async for update in self.iter_message_stream(conversation_id, message, parent_uuid):
            final_text = update.get("text") or final_text
        return (final_text or "").strip()

    async def send_feedback(self, message_id: str, score: int) -> None:
        """
        Send feedback (like/dislike) for a message.

        Args:
            message_id: Message UUID (format: "conversation_id:message_hash")
            score: 1 for like, -1 for dislike
        """
        try:
            url = f"{self.base_url}/chat_api/v1/feedbacks/{message_id}/like"

            logger.info(f"Sending feedback: message_id={message_id}, score={score}")

            resp = await self.client.post(url, json={"score": score})

            # Accept both 200 OK and 204 No Content as success
            if resp.status_code not in (200, 204):
                raise ApiError(
                    f"Feedback error: {resp.status_code}", resp.status_code
                )

            logger.info(f"Feedback sent successfully: message_id={message_id}, score={score}")

        except httpx.RequestError as e:
            raise ApiError(f"Network error sending feedback: {str(e)}")
        except ApiError:
            raise
        except Exception as e:
            raise ApiError(f"Unexpected error sending feedback: {str(e)}")

    def _build_tool_result_payload(
        self, tool_calls: list[dict], parent_uuid: str
    ) -> dict[str, Any]:
        """Build upstream role=tool payload that confirms server-side tool execution."""
        items = []
        for tc in tool_calls:
            tool_call_id = tc.get("id", "")
            item = ToolResultItem(
                status="accepted",
                tool_call_id=tool_call_id,
                content=None,
            )
            items.append(item)

        request = ToolResultRequest(parent_uuid=parent_uuid, content=items)
        return request.model_dump()

    async def get_or_create_session(
        self, create_new: bool = False, programming_language: Optional[str] = None
    ) -> str:
        """Return an active session id, or create a new one."""
        await self._cleanup_old_sessions()

        if create_new or not self.sessions:
            return await self.create_conversation(programming_language=programming_language)

        # Enforce max active sessions
        if len(self.sessions) >= self.settings.MAX_ACTIVE_SESSIONS:
            oldest_session_id = min(
                self.sessions.keys(), key=lambda k: self.sessions[k].last_used
            )
            del self.sessions[oldest_session_id]
            logger.info(f"Removed oldest session: {oldest_session_id}")

        # Return most recently used
        recent_session_id = max(
            self.sessions.keys(), key=lambda k: self.sessions[k].last_used
        )
        return recent_session_id

    async def _cleanup_old_sessions(self):
        """Remove expired sessions by TTL."""
        now = datetime.now()
        ttl_delta = timedelta(seconds=self.settings.SESSION_TTL)
        expired = [
            sid
            for sid, sess in self.sessions.items()
            if now - sess.last_used > ttl_delta
        ]
        for sid in expired:
            del self.sessions[sid]
            logger.info(f"Removed expired session: {sid}")

    async def close(self):
        """Close underlying HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
