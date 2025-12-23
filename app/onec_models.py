"""Pydantic models for 1C.ai API and gateway."""

from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field
from datetime import datetime


class ConversationRequest(BaseModel):
    """Request to create a new conversation."""
    is_chat: bool = True
    programming_language: str = ""
    skill_name: str = "custom"
    ui_language: str = "russian"


class ConversationResponse(BaseModel):
    """Response for creating conversation."""
    uuid: str


class MessageContentInner(BaseModel):
    """Inner content structure for message."""
    instruction: str


class MessageContentOuter(BaseModel):
    """Outer content structure for message."""
    content: MessageContentInner
    tools: Optional[Any] = None


class MessageRequest(BaseModel):
    """Request to send a message."""
    content: MessageContentOuter
    parent_uuid: Optional[str] = None
    role: str = "user"

    @classmethod
    def from_instruction(cls, instruction: str, parent_uuid: Optional[str] = None) -> "MessageRequest":
        """Create MessageRequest from instruction string."""
        return cls(
            content=MessageContentOuter(
                content=MessageContentInner(instruction=instruction),
                tools=None
            ),
            parent_uuid=parent_uuid,
            role="user"
        )


class ContentDelta(BaseModel):
    """Content delta structure in streaming response."""
    content: Optional[str] = None
    reasoning_content: Optional[str] = None
    tool_calls: Optional[Any] = None


class MessageChunk(BaseModel):
    """Chunk of message from SSE stream."""
    uuid: str
    role: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    content_delta: Optional[ContentDelta] = None
    parent_uuid: Optional[str] = None
    finished: bool = False


class ConversationSession(BaseModel):
    """Conversation session state."""
    conversation_id: str
    created_at: datetime = Field(default_factory=datetime.now)
    last_used: datetime = Field(default_factory=datetime.now)
    messages_count: int = 0


# Добавляем метод ПОСЛЕ определения класса, чтобы Pydantic его не видел при инициализации
def _conversation_session_update_usage(self) -> None:
    """Update last used timestamp and message counter."""
    self.last_used = datetime.now()
    self.messages_count += 1

ConversationSession.update_usage = _conversation_session_update_usage


class ApiError(Exception):
    """1C.ai API error."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)