from __future__ import annotations

import logging
from typing import Dict, Any, Optional

from .models import (
    InitializeParams,
    InitializeResult,
    ServerInfo,
    ToolsListResult,
    ToolDesc,
    ToolsCallParams,
    ToolsCallResult,
    ToolsCallTextContent,
)
from ..onec_client import OneCApiClient
from ..streaming import sanitize_text
from .session import McpSessionStore
from ..text_utils import prepare_message_for_upstream

logger = logging.getLogger(__name__)


class ToolNotFoundError(Exception):
    pass


class McpHandlers:
    """
    Implements minimal MCP methods: initialize, tools/list, tools/call.
    Delegates to OneCApiClient for 1C.ai operations.
    """

    def __init__(self, onec_client: OneCApiClient, store: McpSessionStore):
        self.client = onec_client
        self.store = store

    async def initialize(self, params: InitializeParams, protocol_version: str) -> InitializeResult:
        # Echo minimal capabilities; tools supported
        return InitializeResult(
            protocolVersion=protocol_version,
            serverInfo=ServerInfo(name="1C.ai Gateway MCP", version="1.0.0"),
            capabilities={"tools": {}},
        )

    async def tools_list(self) -> ToolsListResult:
        # Add length constraints from settings for all string fields
        s = self.client.settings
        min_len = getattr(s, "MCP_TOOL_INPUT_MIN_LENGTH", 0)
        max_len = getattr(s, "MCP_TOOL_INPUT_MAX_LENGTH", 200000)

        tools = [
            ToolDesc(
                name="ask_1c_ai",
                description="Задать вопрос специализированному ИИ-ассистенту по платформе 1С:Предприятие. Используйте для общих вопросов и советов. Не используйте для проверки конкретного кода или объяснения термина — для этого есть другие инструменты.",
                inputSchema={
                    "type": "object",
                    "title": "Ask 1C expert",
                    "description": "Задать экспертный вопрос по платформе 1С:Предприятие. Не для проверки конкретного кода.",
                    "properties": {
                        "question": {
                            "type": "string",
                            "title": "Question",
                            "description": "Чёткая формулировка вопроса/задачи.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "programming_language": {
                            "type": "string",
                            "title": "Programming language",
                            "description": "Язык программирования (опционально).",
                            "enum": ["", "BSL", "SQL", "JSON", "HTTP"],
                            "default": "",
                            "maxLength": max_len,
                        },
                        "create_new_session": {
                            "type": "boolean",
                            "title": "Create new conversation",
                            "description": "Создать новый разговор (сброс контекста).",
                            "default": False,
                        },
                    },
                    "required": ["question"],
                    "examples": [
                        { "question": "Как правильно использовать HTTPЗапрос для POST с JSON?" },
                        { "question": "Как структурировать модуль объекта для тестируемости?", "programming_language": "BSL" }
                    ],
                    "x-ai-tags": ["1c", "ask", "general", "expert"],
                    "x-ai-usage": "Используй для общих вопросов и советов по 1С. Не используй для проверки кода или пояснения конкретного термина.",
                    "x-ai-negative-examples": [
                        "Поясни, что делает ТаблицаЗначений (используй explain_1c_syntax).",
                        "Проверь мой код на ошибки (используй check_1c_code)."
                    ],
                },
            ),
            ToolDesc(
                name="explain_1c_syntax",
                description="Объяснить конкретный элемент синтаксиса/объект платформы 1С (например, HTTPСоединение, HTTPЗапрос, ТаблицаЗначений, Запрос) с примерами. Не использовать для аудита кода.",
                inputSchema={
                    "type": "object",
                    "title": "Explain 1C syntax",
                    "description": "Поясняет конкретный элемент синтаксиса/объект платформы 1С с примерами.",
                    "properties": {
                        "syntax_element": {
                            "type": "string",
                            "title": "Syntax element",
                            "description": "Название элемента (например, HTTPЗапрос, ТаблицаЗначений).",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "context": {
                            "type": "string",
                            "title": "Context",
                            "description": "Доп. контекст: где/как используется (опционально).",
                            "default": "",
                            "minLength": 0,
                            "maxLength": max_len,
                        },
                    },
                    "required": ["syntax_element"],
                    "examples": [
                        { "syntax_element": "HTTPСоединение", "context": "аутентификация и повторные попытки" },
                        { "syntax_element": "Запрос" }
                    ],
                    "x-ai-tags": ["1c", "syntax", "explain"],
                    "x-ai-usage": "Используй для объяснения конкретного термина/объекта 1С. Не используй для аудита или оптимизации кода.",
                },
            ),
            ToolDesc(
                name="check_1c_code",
                description="Проверить присланный BSL/1C код на ошибки/проблемы (syntax/logic/performance). Использовать, когда есть конкретный фрагмент кода.",
                inputSchema={
                    "type": "object",
                    "title": "Check 1C code",
                    "description": "Проверяет присланный BSL/1C код на ошибки/проблемы.",
                    "properties": {
                        "code": {
                            "type": "string",
                            "title": "Code",
                            "description": "Проверяемый код (желательно компактный фрагмент).",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "check_type": {
                            "type": "string",
                            "title": "Check type",
                            "description": "Тип проверки.",
                            "enum": ["syntax", "logic", "performance"],
                            "default": "syntax",
                        },
                    },
                    "required": ["code"],
                    "examples": [
                        { "code": "Процедура Тест()\n Сообщить(\"Привет\");\nКонецПроцедуры", "check_type": "syntax" },
                        { "code": "// длинный обработчик...\n", "check_type": "performance" }
                    ],
                    "x-ai-tags": ["1c", "code", "lint", "audit"],
                    "x-ai-usage": "Используй при наличии конкретного кода для анализа.",
                },
            ),
        ]
        return ToolsListResult(tools=tools)

    async def tools_call(self, params: ToolsCallParams, session_id: Optional[str]) -> ToolsCallResult:
        """
        Call supported tool and return text content result list (OpenAI-like).
        """
        name = params.name
        args: Dict[str, Any] = params.arguments or {}

        if name == "ask_1c_ai":
            question = (args.get("question") or "").strip()
            programming_language = (args.get("programming_language") or "").strip() or None
            create_new_session = bool(args.get("create_new_session") or False)

            if not question:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Вопрос не может быть пустым")])

            # Apply global input length limit
            prepared_question, was_truncated = prepare_message_for_upstream(question, self.client.settings)
            if was_truncated:
                logger.warning(
                    f"MCP ask_1c_ai question truncated from {len(question)} to {len(prepared_question)} characters"
                )

            # Tie MCP session to 1C.ai conversation
            conv_id: Optional[str] = None
            if session_id:
                conv_id = self.store.get_conversation(session_id)

            if create_new_session or not conv_id:
                conv_id = await self.client.create_conversation(programming_language=programming_language)
                if session_id:
                    self.store.set_conversation(session_id, conv_id)

            answer = await self.client.send_message_full(conv_id, prepared_question)
            clean = sanitize_text(answer)
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Ответ от 1С.ai:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        elif name == "explain_1c_syntax":
            syntax_element = (args.get("syntax_element") or "").strip()
            context = (args.get("context") or "").strip()

            if not syntax_element:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Элемент синтаксиса не может быть пустым")])

            question = f"Объясни синтаксис и использование: {syntax_element}"
            if context:
                question += f" в контексте: {context}"

            # Apply global input length limit
            prepared_question, was_truncated = prepare_message_for_upstream(question, self.client.settings)
            if was_truncated:
                logger.warning(
                    f"MCP explain_1c_syntax question truncated from {len(question)} to {len(prepared_question)} characters"
                )

            conv_id: Optional[str] = None
            if session_id:
                conv_id = self.store.get_conversation(session_id)
            if not conv_id:
                conv_id = await self.client.create_conversation()
                if session_id:
                    self.store.set_conversation(session_id, conv_id)

            answer = await self.client.send_message_full(conv_id, prepared_question)
            clean = sanitize_text(answer)
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Объяснение синтаксиса '{syntax_element}':\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        elif name == "check_1c_code":
            code = (args.get("code") or "").strip()
            check_type = (args.get("check_type") or "syntax").strip()
            if not code:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Код для проверки не может быть пустым")])

            check_descriptions = {
                "syntax": "синтаксические ошибки",
                "logic": "логические ошибки и потенциальные проблемы",
                "performance": "проблемы производительности и оптимизации",
            }
            check_desc = check_descriptions.get(check_type, "ошибки")
            question = f"Проверь этот код 1С на {check_desc} и дай рекомендации:\n\n```1c\n{code}\n```"

            # Apply global input length limit
            prepared_question, was_truncated = prepare_message_for_upstream(question, self.client.settings)
            if was_truncated:
                logger.warning(
                    f"MCP check_1c_code question truncated from {len(question)} to {len(prepared_question)} characters"
                )

            conv_id: Optional[str] = None
            if session_id:
                conv_id = self.store.get_conversation(session_id)
            if not conv_id:
                conv_id = await self.client.create_conversation()
                if session_id:
                    self.store.set_conversation(session_id, conv_id)

            answer = await self.client.send_message_full(conv_id, prepared_question)
            clean = sanitize_text(answer)
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Проверка кода на {check_desc}:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        else:
            raise ToolNotFoundError(name)