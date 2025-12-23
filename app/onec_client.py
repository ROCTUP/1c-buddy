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
        except Exception as e:
            raise ApiError(f"Unexpected error creating conversation: {str(e)}")

    async def iter_message_stream(
        self, conversation_id: str, message: str, parent_uuid: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Send a message and yield streaming updates.
        Yields dicts: {"text": <full_text_so_far>, "finished": bool}
        """
        try:
            # Ensure session exists
            if conversation_id not in self.sessions:
                self.sessions[conversation_id] = ConversationSession(
                    conversation_id=conversation_id
                )

            # Update usage
            self.sessions[conversation_id].update_usage()

            # Use parent_uuid from parameter (passed from frontend via localStorage)
            logger.debug(f"parent_uuid from request: {parent_uuid}")
            request_data = MessageRequest.from_instruction(message, parent_uuid=parent_uuid)
            url = f"{self.base_url}/chat_api/v1/conversations/{conversation_id}/messages"
            payload = request_data.model_dump()
            request_headers = {"Accept": "text/event-stream"}

            if logger.isEnabledFor(logging.DEBUG):
                # Redact sensitive headers for logging
                safe_headers = {k: ("****" if k.lower() == "authorization" else v)
                               for k, v in {**self.client.headers, **request_headers}.items()}
                logger.debug(
                    "Sending message to upstream %s - conversation_id=%s headers=%s payload=%s",
                    url,
                    conversation_id,
                    safe_headers,
                    json.dumps(payload, ensure_ascii=False)
                )
            else:
                logger.info("Sending message to upstream - conversation_id=%s", conversation_id)

            async with self.client.stream(
                "POST",
                url,
                json=payload,
                headers=request_headers,
            ) as response:
                if response.status_code != 200:
                    raise ApiError(
                        f"Message send error: {response.status_code}",
                        response.status_code,
                    )

                # Parse SSE lines
                response.encoding = "utf-8"
                accumulated_text = ""  # Accumulate full text for delta format
                prev_cumulative = ""   # Track previous cumulative text for legacy format
                last_full_text = ""  # Track last full text for logging (both formats)

                try:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            logger.warning(f"SSE json parse error: {e}")
                            continue

                        try:
                            chunk = MessageChunk(**data)
                        except Exception as e:
                            logger.warning(f"SSE chunk model error: {e}")
                            continue

                        # Extract text and determine if it's delta or cumulative format
                        is_delta_format = False
                        raw_text = ""

                        # New format: content_delta.content (delta format - incremental text)
                        if chunk.content_delta and chunk.content_delta.content:
                            raw_text = chunk.content_delta.content
                            is_delta_format = True
                        # Legacy format: content.text (cumulative format - full text each time)
                        elif chunk.content and "text" in chunk.content:
                            raw_text = chunk.content.get("text") or ""
                            is_delta_format = False

                        # Only process if we have text and role is assistant (or content_delta exists)
                        if raw_text and (chunk.role == "assistant" or chunk.content_delta):
                            if is_delta_format:
                                # New delta format: accumulate text
                                accumulated_text += raw_text
                                final_text = accumulated_text
                            else:
                                # Legacy cumulative format: use text as-is, skip if unchanged
                                if raw_text == prev_cumulative:
                                    continue
                                prev_cumulative = raw_text
                                final_text = raw_text

                            # Clean UTF-8 errors from final text
                            cleaned_text = (
                                final_text.encode("utf-8", errors="ignore").decode(
                                    "utf-8", errors="ignore"
                                )
                            )
                            last_full_text = cleaned_text  # Track for logging on disconnect

                            # Log for debugging
                            logger.debug(
                                f"[UPSTREAM] format={'delta' if is_delta_format else 'cumulative'}, "
                                f"chunk_len={len(raw_text)}, total_len={len(cleaned_text)}"
                            )

                            yield {
                                "text": cleaned_text,
                                "finished": bool(chunk.finished),
                                "message_id": chunk.uuid  # Include message UUID for feedback
                            }

                        # Check for finished assistant message (even without text)
                        if chunk.finished and (chunk.role == "assistant" or chunk.content_delta):
                            # TEMPORARY: Log full final text from upstream for debugging
                            logger.debug(f"[UPSTREAM FINAL TEXT]:\n{cleaned_text}")
                            break

                        # Also check for finished user message echo (new format)
                        # Skip breaking on user message finished=true, wait for assistant response
                        if chunk.role == "user" and chunk.finished:
                            logger.debug(f"Received user message echo, waiting for assistant response")
                            continue
                except (GeneratorExit, asyncio.CancelledError):
                    # Client disconnected or stream cancelled - это нормально
                    logger.debug("Stream cancelled or client disconnected")
                    # TEMPORARY: Log accumulated text before exit
                    logger.debug(f"[UPSTREAM FINAL TEXT (on disconnect)]:\n{last_full_text}")
                    raise

        except httpx.RequestError as e:
            raise ApiError(f"Network error sending message: {str(e)}")
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
        except Exception as e:
            raise ApiError(f"Unexpected error sending feedback: {str(e)}")

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