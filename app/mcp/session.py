from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

from fastapi import Request


def _now() -> int:
    return int(time.time())


def generate_session_id() -> str:
    # Visible ASCII only: hex UUID fits
    return uuid.uuid4().hex


@dataclass
class McpSession:
    session_id: str
    protocol_version: str
    created: int = field(default_factory=_now)
    last_seen: int = field(default_factory=_now)
    conversation_id: Optional[str] = None

    def touch(self) -> None:
        self.last_seen = _now()


class McpSessionStore:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._sessions: Dict[str, McpSession] = {}
        self._ttl = ttl_seconds

    def create(self, protocol_version: str) -> McpSession:
        sid = generate_session_id()
        sess = McpSession(session_id=sid, protocol_version=protocol_version)
        self._sessions[sid] = sess
        return sess

    def get(self, session_id: str) -> Optional[McpSession]:
        sess = self._sessions.get(session_id)
        if not sess:
            return None
        if self._expired(sess):
            # expire
            del self._sessions[session_id]
            return None
        sess.touch()
        return sess

    def get_conversation(self, session_id: str) -> Optional[str]:
        sess = self.get(session_id)
        return sess.conversation_id if sess else None

    def set_conversation(self, session_id: str, conversation_id: str) -> bool:
        sess = self.get(session_id)
        if not sess:
            return False
        sess.conversation_id = conversation_id
        return True

    def _expired(self, sess: McpSession) -> bool:
        return (_now() - sess.last_seen) > self._ttl

    def cleanup(self) -> None:
        now = _now()
        to_del = [sid for sid, s in self._sessions.items() if (now - s.last_seen) > self._ttl]
        for sid in to_del:
            del self._sessions[sid]


def extract_protocol_version(request: Request) -> str:
    """
    Extract MCP-Protocol-Version header. If absent, use oldest version for compatibility.
    """
    default_ver = "2025-03-26"  # Use oldest stable version for max compatibility
    ver = request.headers.get("mcp-protocol-version") or default_ver
    return ver


def validate_origin(request: Request) -> bool:
    """
    Origin validation is disabled by choice. Always allow.
    """
    return True