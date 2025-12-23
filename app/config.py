# Configuration for OpenAI-compatible gateway to 1C.ai

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Settings loaded from environment variables only.
    In Docker: variables are injected via docker-compose env_file directive.
    In local dev: export variables or use docker-compose for consistency.
    """
    model_config = SettingsConfigDict(
        case_sensitive=True,
        extra="ignore",
    )

    # Gateway auth (optional - if not set, OpenAI-compatible API will be disabled)
    OPENAI_COMPAT_API_KEY: Optional[str] = Field(None, description="API key for the gateway", alias="OPENAI_COMPAT_API_KEY")

    # Upstream 1C.ai API
    ONEC_AI_TOKEN: str = Field(..., description="1C.ai API token", alias="ONEC_AI_TOKEN")
    ONEC_AI_BASE_URL: str = Field("https://code.1c.ai", description="Base URL for 1C.ai", alias="ONEC_AI_BASE_URL")
    ONEC_AI_TIMEOUT: int = Field(30, description="Timeout in seconds", alias="ONEC_AI_TIMEOUT")

    # Model defaults
    ONEC_AI_UI_LANGUAGE: str = Field("russian", alias="ONEC_AI_UI_LANGUAGE")
    ONEC_AI_PROGRAMMING_LANGUAGE: str = Field("", alias="ONEC_AI_PROGRAMMING_LANGUAGE")
    ONEC_AI_SCRIPT_LANGUAGE: str = Field("", alias="ONEC_AI_SCRIPT_LANGUAGE")

    # Session management
    MAX_ACTIVE_SESSIONS: int = Field(300, alias="MAX_ACTIVE_SESSIONS")
    SESSION_TTL: int = Field(3600, alias="SESSION_TTL")

    # MCP tools input limits
    MCP_TOOL_INPUT_MIN_LENGTH: int = Field(4, alias="MCP_TOOL_INPUT_MIN_LENGTH")
    MCP_TOOL_INPUT_MAX_LENGTH: int = Field(100000, alias="MCP_TOOL_INPUT_MAX_LENGTH")

    # Global input length limit for upstream server (applies to all services: chat, OpenAI API, MCP)
    ONEC_AI_INPUT_MAX_LENGTH: int = Field(100000, alias="ONEC_AI_INPUT_MAX_LENGTH")

    # Logging
    LOG_REQUEST_BODY_MAX_LENGTH: int = Field(40000, alias="LOG_REQUEST_BODY_MAX_LENGTH")

    # Chat file attachments
    MAX_ATTACHED_FILES_SIZE_KB: int = Field(100, alias="MAX_ATTACHED_FILES_SIZE_KB", description="Maximum total size of attached files in KB")

    # Public model id to report to clients
    PUBLIC_MODEL_ID: str = Field("1c-buddy", alias="PUBLIC_MODEL_ID")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def check_gateway_api_key(auth_header: Optional[str], settings: Optional[Settings] = None) -> bool:
    """
    Validate Authorization: Bearer <key> header.
    """
    if not auth_header:
        return False
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False
    key = parts[1]
    s = settings or get_settings()
    return key == s.OPENAI_COMPAT_API_KEY