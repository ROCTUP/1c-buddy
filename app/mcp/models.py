from typing import Optional, Any, Union, Dict, List, Literal
from pydantic import BaseModel, Field

# Protocol versions we support (latest first)
SUPPORTED_PROTOCOL_VERSIONS: set[str] = {"2025-06-18", "2025-03-26"}


# ---- JSON-RPC 2.0 envelopes ----

class JsonRpcRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[Union[str, int]] = None  # id is absent for notifications


class JsonRpcError(BaseModel):
    code: int
    message: str
    data: Optional[Any] = None


class JsonRpcResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    result: Optional[Any] = None
    error: Optional[JsonRpcError] = None
    id: Optional[Union[str, int]] = None


# ---- MCP basic models ----

class ClientInfo(BaseModel):
    name: str
    version: Optional[str] = None


class InitializeParams(BaseModel):
    protocolVersion: Optional[str] = None
    clientInfo: ClientInfo
    capabilities: Dict[str, Any] = Field(default_factory=dict)


class ServerInfo(BaseModel):
    name: str
    version: str


class InitializeResult(BaseModel):
    protocolVersion: str
    serverInfo: ServerInfo
    capabilities: Dict[str, Any] = Field(default_factory=dict)


# Tools

class ToolDesc(BaseModel):
    name: str
    description: str
    inputSchema: Dict[str, Any]


class ToolsListResult(BaseModel):
    tools: List[ToolDesc]


class ToolsCallParams(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class ToolsCallTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str


class ToolsCallResult(BaseModel):
    content: List[ToolsCallTextContent]