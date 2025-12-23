# OpenAI-compatible schema models for chat completions API

from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field

class ContentPart(BaseModel):
    # OpenAI content part (we only need 'text' now; allow extras for forward-compat)
    type: Optional[str] = None
    text: Optional[str] = None
    image_url: Optional[Any] = None
    model_config = {"extra": "allow"}

class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    # Accept both string and array-of-parts per OpenAI SDKs
    content: Union[str, List[Union[str, ContentPart, Dict[str, Any]]]]

class ChatCompletionsRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    stop: Optional[List[str]] = None
    n: Optional[int] = None
    user: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ChatMessageResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str

class ChatChoice(BaseModel):
    index: int = 0
    message: ChatMessageResponse
    finish_reason: Optional[str] = None

class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class ChatCompletion(BaseModel):
    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: List[ChatChoice]
    usage: Optional[Usage] = None

class DeltaMessage(BaseModel):
    role: Optional[Literal["assistant"]] = None
    content: Optional[str] = None

class ChatCompletionChunkChoice(BaseModel):
    index: int = 0
    delta: DeltaMessage
    finish_reason: Optional[str] = None

class ChatCompletionChunk(BaseModel):
    id: str
    object: Literal["chat.completion.chunk"] = "chat.completion.chunk"
    created: int
    model: str
    choices: List[ChatCompletionChunkChoice]

class ModelData(BaseModel):
    id: str
    object: Literal["model"] = "model"
    created: int
    owned_by: str = "onec-ai"

class ModelList(BaseModel):
    object: Literal["list"] = "list"
    data: List[ModelData]