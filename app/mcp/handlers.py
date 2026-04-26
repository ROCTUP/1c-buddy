from __future__ import annotations

import logging
from typing import Dict, Any, Optional, List

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
from .upstream_tools_client import McpUpstreamToolsClient
from ..streaming import sanitize_text
from .session import McpSessionStore
from ..text_utils import prepare_message_for_upstream

logger = logging.getLogger(__name__)


class ToolNotFoundError(Exception):
    pass


class McpHandlers:
    """MCP handlers backed only by MCP-specific upstream client."""

    def __init__(self, mcp_client: McpUpstreamToolsClient, store: McpSessionStore):
        self.client = mcp_client
        self.store = store

    async def _get_or_create_conversation(
        self,
        session_id: Optional[str],
        *,
        create_new_session: bool = False,
        programming_language: Optional[str] = None,
    ) -> str:
        conv_id: Optional[str] = None
        if session_id:
            conv_id = self.store.get_conversation(session_id)
        if create_new_session or not conv_id:
            conv_id = await self.client.create_conversation(
                programming_language=programming_language
            )
            if session_id:
                self.store.set_conversation(session_id, conv_id)
        return conv_id

    async def _create_isolated_conversation(
        self,
        session_id: Optional[str],
        *,
        programming_language: Optional[str] = None,
    ) -> str:
        conv_id = await self.client.create_conversation(
            programming_language=programming_language
        )
        if session_id:
            self.store.set_conversation(session_id, conv_id)
        return conv_id

    def _extract_tool_text(
        self, result: Dict[str, Any], *, include_tool_details: bool = False
    ) -> str:
        full_text = (result.get("full_text") or "").strip()
        followups = [
            item.get("text", "").strip()
            for item in result.get("tool_followups", [])
            if item.get("text")
        ]
        final_text = (result.get("final_text") or "").strip()
        tool_results = result.get("tool_results") or []

        blocks: List[str] = []
        for item in tool_results:
            md = (item.get("response_markdown") or "").strip()
            if md and md != "✓ Инструмент выполнен":
                blocks.append(md)
            details = item.get("response_details") or []
            if include_tool_details and details:
                blocks.extend(str(detail) for detail in details if detail)

        if full_text:
            blocks.append(full_text)
        elif followups:
            blocks.append(followups[-1])
        elif final_text:
            blocks.append(final_text)
        return "\n".join(part for part in blocks if part).strip()

    def _extract_task_text(self, result: Dict[str, Any]) -> str:
        full_text = (result.get("full_text") or "").strip()
        if full_text:
            return full_text
        final_text = (result.get("final_text") or "").strip()
        if final_text:
            return final_text
        followups = [
            item.get("text", "").strip()
            for item in result.get("tool_followups", [])
            if item.get("text")
        ]
        return followups[-1] if followups else ""

    def _extract_standard_text(self, result: Dict[str, Any]) -> str:
        full_text = (result.get("full_text") or "").strip()
        if full_text:
            return full_text
        final_text = (result.get("final_text") or "").strip()
        if final_text:
            return final_text
        followups = [
            item.get("text", "").strip()
            for item in result.get("tool_followups", [])
            if item.get("text")
        ]
        return followups[-1] if followups else ""

    def _use_direct_mode(self) -> bool:
        return (self.client.settings.MCP_TOOL_CALL_MODE or "standard").strip().lower() == "direct"

    def _with_default_bsp_context(self, text: str) -> str:
        default_bsp_version = (self.client.settings.DEFAULT_BSP_VERSION or "").strip()
        if not default_bsp_version:
            return text
        context = (
            "Контекст пользователя:\n"
            f"- По умолчанию используй Библиотеку стандартных подсистем (БСП) версии {default_bsp_version}.\n"
            "- Если пользователь явно указал другую версию БСП, используй указанную им версию.\n"
            "- При поиске и ссылках на ИТС предпочитай материалы, соответствующие этой версии БСП.\n\n"
        )
        return f"{context}{text}"

    @staticmethod
    def _build_check_review_prompt(code: str) -> str:
        return (
            "Проведи code review этого кода 1С. Найди ошибки, нарушения стандартов, "
            "риски и предложи исправленный вариант.\n\n"
            "Код:\n```bsl\n"
            f"{code}\n"
            "```"
        )

    @staticmethod
    def _build_modify_prompt(instruction: str, code: str) -> str:
        base = (
            "Измени этот код 1С по заданию пользователя. Верни итоговый измененный код "
            "и кратко перечисли, что именно было изменено.\n\n"
            f"Задание:\n{instruction.strip()}"
        )
        validation_tail = (
            "\n\n"
            "ОБЯЗАТЕЛЬНО выполни синтаксическую проверку измененного кода с помощью "
            "инструмента mcp__syntax-checker__validate перед отправкой результата."
        )
        if code.strip():
            return (
                f"{base}\n\n"
                "Код:\n```bsl\n"
                f"{code}\n"
                "```"
                f"{validation_tail}"
            )
        return f"{base}{validation_tail}"

    @staticmethod
    def _build_check_syntax_prompt(code: str, extended: bool) -> str:
        suffix = (
            " Используй расширенную проверку со стандартами 1С."
            if extended
            else ""
        )
        return (
            "Проверь этот код 1С на синтаксические ошибки перед отправкой пользователю."
            f"{suffix}\n\n"
            "Код:\n```bsl\n"
            f"{code}\n"
            "```"
        )

    @staticmethod
    def _build_search_documentation_prompt(query: str, version: str) -> str:
        return (
            "Найди информацию в документации платформы 1С:Предприятие. "
            f"Используй документацию версии {version}. "
            "Верни краткий, но информативный ответ по найденным данным.\n\n"
            f"Запрос: {query}"
        )

    @staticmethod
    def _build_search_its_prompt(query: str) -> str:
        return (
            "Выполни поиск в базе знаний ИТС по этому запросу. "
            "Верни фактический результат и обязательно сохрани ссылки на источники.\n\n"
            f"Запрос: {query}"
        )

    @staticmethod
    def _build_fetch_its_prompt(item_id: str) -> str:
        return (
            "Получить содержимое документа, каталога или базы ИТС по идентификатору.\n\n"
            f"id: {item_id}"
        )

    @staticmethod
    def _build_diff_prompt(version_a: str, version_b: str, query: str) -> str:
        scope = f"\nПредметная область: {query}" if query else ""
        return (
            "Сравни документацию платформы 1С между двумя версиями и верни различия.\n\n"
            f"Более ранняя версия: {version_a}\n"
            f"Более поздняя версия: {version_b}"
            f"{scope}"
        )

    async def initialize(self, params: InitializeParams, protocol_version: str) -> InitializeResult:
        return InitializeResult(
            protocolVersion=protocol_version,
            serverInfo=ServerInfo(name="1C.ai Gateway MCP", version="1.0.0"),
            capabilities={"tools": {}},
        )

    async def tools_list(self) -> ToolsListResult:
        s = self.client.settings
        min_len = getattr(s, "MCP_TOOL_INPUT_MIN_LENGTH", 0)
        max_len = getattr(s, "MCP_TOOL_INPUT_MAX_LENGTH", 200000)

        tools = [
            ToolDesc(
                name="ask_1c_ai",
                description=(
                    "Задать общий вопрос по платформе 1С:Предприятие и получить ответ, "
                    "объяснение или практическую рекомендацию. Используй для общих вопросов "
                    "по функциональности платформы, подходам к разработке и типовым сценариям, "
                    "когда не нужен отдельный специализированный поиск по документации или ИТС."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Ask 1C expert",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "Вопрос или задача на русском языке. Старайся формулировать конкретно.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "programming_language": {
                            "type": "string",
                            "description": "Язык, если вопрос связан с кодом или синтаксисом.",
                            "enum": ["", "BSL", "SQL", "JSON", "HTTP"],
                            "default": "",
                            "maxLength": max_len,
                        },
                    },
                    "required": ["question"],
                },
            ),
            ToolDesc(
                name="explain_1c_syntax",
                description=(
                    "Объяснить конкретный элемент синтаксиса, объект или тип платформы 1С "
                    "с примерами использования. Используй, когда нужно понять, как работает "
                    "конкретный метод, объект, коллекция или конструкция языка."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Explain 1C syntax",
                    "properties": {
                        "syntax_element": {
                            "type": "string",
                            "description": "Название элемента, который нужно объяснить, например HTTPЗапрос, ТаблицаЗначений или Запрос.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "context": {
                            "type": "string",
                            "description": "Дополнительный контекст использования, если он важен для ответа.",
                            "default": "",
                            "minLength": 0,
                            "maxLength": max_len,
                        },
                    },
                    "required": ["syntax_element"],
                },
            ),
            ToolDesc(
                name="check_1c_code",
                description=(
                    "Проверить присланный BSL/1C код. Используй check_type='syntax' для "
                    "быстрой синтаксической проверки конкретного фрагмента и check_type='review' "
                    "для code review, поиска ошибок и замечаний по качеству кода. "
                    "Проверка syntax выполняется без глобального контекста, поэтому возможны "
                    "ложные срабатывания по необъявленным переменным и методам."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Check 1C code",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "Проверяемый фрагмент кода 1С.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "check_type": {
                            "type": "string",
                            "description": "syntax — синтаксическая проверка; review — code review. Значения logic/performance сохранены для обратной совместимости и обрабатываются как review.",
                            "enum": ["syntax", "review", "logic", "performance"],
                            "default": "syntax",
                        },
                        "extended": {
                            "type": "boolean",
                            "description": "Только для syntax: включить обогащение стандартами 1С.",
                            "default": False,
                        },
                    },
                    "required": ["code"],
                },
            ),
            ToolDesc(
                name="modify_1c_code",
                description=(
                    "Изменить код 1С по явному заданию пользователя: исправить ошибку, "
                    "сделать рефакторинг или добавить функциональность. В instruction "
                    "опиши, какие изменения нужны и что ожидается на выходе. Если есть "
                    "исходный код, передай его в параметре code."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Modify 1C code",
                    "properties": {
                        "instruction": {
                            "type": "string",
                            "description": "Четкое описание задачи на русском языке: что нужно изменить и какой результат ожидается.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "code": {
                            "type": "string",
                            "description": "Исходный код 1С, который нужно изменить.",
                            "default": "",
                            "minLength": 0,
                            "maxLength": max_len,
                        },
                    },
                    "required": ["instruction"],
                },
            ),
            ToolDesc(
                name="search_1c_documentation",
                description=(
                    "Поиск по документации платформы 1С:Предприятие. Используй, когда вопрос "
                    "касается функциональности самой платформы: объектов, методов, свойств, "
                    "синтаксиса и параметров, а также перед написанием кода, если нужна точная "
                    "документация по элементу платформы. Не выдумывай синтаксис и поведение, "
                    "если их можно сначала найти в документации. Для общих запросов формируй "
                    "query так, чтобы он искал обзорную информацию: 'Общая информация о ...', "
                    "'Список всех ...', 'Все ...'. Если пользователь указал версию платформы, "
                    "обязательно передай её."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Search 1C documentation",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Поисковый запрос для embedding-поиска. Для общих тем лучше писать 'Общая информация о ...' или 'Список всех ...'.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                        "version": {
                            "type": "string",
                            "description": "Версия документации платформы в формате v8.x.x или v8.x.x.x.",
                            "default": "v8.5.1",
                            "maxLength": max_len,
                        },
                    },
                    "required": ["query"],
                },
            ),
            ToolDesc(
                name="search_its",
                description=(
                    "Поиск по базе знаний ИТС. Используй для стандартов и правил разработки "
                    "на 1С, методических материалов, практических примеров, вопросов по "
                    "конкретным конфигурациям и продуктам 1С, а также по EDT и Конфигуратору. "
                    "Для фактологических вопросов по экосистеме 1С предпочитай именно этот "
                    "инструмент, а не ответ по памяти. Если найденной информации недостаточно, "
                    "переформулируй query или затем используй fetch_its для чтения конкретного документа."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Search ITS",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Поисковый запрос для embedding-поиска по ИТС.",
                            "minLength": min_len,
                            "maxLength": max_len,
                        },
                    },
                    "required": ["query"],
                },
            ),
            ToolDesc(
                name="fetch_its",
                description=(
                    "Получить содержимое документа, каталога или базы ИТС по id. Обычно "
                    "используется после search_its, когда уже найден нужный документ, либо "
                    "для исследования структуры ИТС с id='root'. Поддерживаются как специальные "
                    "id вроде root, superior, v8std, так и идентификаторы документов и каталогов "
                    "вида its-...-hdoc или its-...-hdir, возможно с 1-2 якорями через '/'. "
                    "Обычно id документа выглядит как 'its-{database_id}-{doc_or_dir_id}-(hdoc|hdir|...)'."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Fetch ITS",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Идентификатор документа, каталога или базы ИТС: root, superior, v8std или строка вида its-...-hdoc/hdir.",
                            "default": "root",
                            "minLength": 1,
                            "maxLength": max_len,
                        },
                    },
                    "required": ["id"],
                },
            ),
            ToolDesc(
                name="diff_1c_documentation_versions",
                description=(
                    "Сравнить документацию платформы 1С между двумя версиями. Используй, "
                    "когда спрашивают об изменениях между версиями платформы. version_a "
                    "должна быть более ранней, version_b — более поздней. Параметр query "
                    "задаёт предметную область сравнения. Если разница пустая, но вернулся "
                    "список изменённых файлов, значит query нужно переформулировать."
                ),
                inputSchema={
                    "type": "object",
                    "title": "Diff 1C documentation versions",
                    "properties": {
                        "version_a": {
                            "type": "string",
                            "description": "Более ранняя версия в формате v8.3.27 или v8.3.27.189.",
                            "minLength": 2,
                            "maxLength": max_len,
                        },
                        "version_b": {
                            "type": "string",
                            "description": "Более поздняя версия в формате v8.3.27 или v8.3.27.189.",
                            "minLength": 2,
                            "maxLength": max_len,
                        },
                        "query": {
                            "type": "string",
                            "description": "Необязательная предметная область сравнения, например 'HTTP соединение'.",
                            "default": "",
                            "maxLength": max_len,
                        },
                    },
                    "required": ["version_a", "version_b"],
                },
            ),
        ]
        return ToolsListResult(tools=tools)

    async def tools_call(self, params: ToolsCallParams, session_id: Optional[str]) -> ToolsCallResult:
        name = params.name
        args: Dict[str, Any] = params.arguments or {}

        if name == "ask_1c_ai":
            question = (args.get("question") or "").strip()
            programming_language = (args.get("programming_language") or "").strip() or None
            if not question:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Вопрос не может быть пустым")])
            question = self._with_default_bsp_context(question)
            prepared_question, _ = prepare_message_for_upstream(question, self.client.settings)
            conv_id = await self._create_isolated_conversation(
                session_id, programming_language=programming_language
            )
            if self._use_direct_mode():
                result = await self.client.call_task(
                    conv_id,
                    instruction=prepared_question,
                    skill="custom",
                )
                clean = sanitize_text(self._extract_task_text(result))
            else:
                result = await self.client.call_prompt(conv_id, instruction=prepared_question)
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Ответ от 1С.ai:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name == "explain_1c_syntax":
            syntax_element = (args.get("syntax_element") or "").strip()
            context = (args.get("context") or "").strip()
            if not syntax_element:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Элемент синтаксиса не может быть пустым")])
            question = f"Объясни синтаксис и использование: {syntax_element}"
            if context:
                question += f" в контексте: {context}"
            question = self._with_default_bsp_context(question)
            prepared_question, _ = prepare_message_for_upstream(question, self.client.settings)
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode():
                result = await self.client.call_task(
                    conv_id,
                    instruction=prepared_question,
                    skill="explain",
                )
                clean = sanitize_text(self._extract_task_text(result))
            else:
                result = await self.client.call_prompt(conv_id, instruction=prepared_question)
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Объяснение синтаксиса '{syntax_element}':\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name == "check_1c_code":
            code = (args.get("code") or "").strip()
            check_type = (args.get("check_type") or "syntax").strip()
            extended = bool(args.get("extended") or False)
            if not code:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: Код для проверки не может быть пустым")])
            normalized_check_type = {"logic": "review", "performance": "review"}.get(check_type, check_type)
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode() and normalized_check_type == "syntax":
                result = await self.client.call_exact_tool(
                    conv_id,
                    tool_name="mcp__syntax-checker__validate",
                    arguments={"code": code, "extended": extended},
                    payload_ensure_ascii=False,
                )
                clean = sanitize_text(self._extract_tool_text(result, include_tool_details=True))
                return ToolsCallResult(content=[ToolsCallTextContent(text=f"Проверка кода на синтаксис:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

            if self._use_direct_mode():
                result = await self.client.call_task(
                    conv_id,
                    instruction=self._build_check_review_prompt(code),
                    skill="review",
                )
                clean = sanitize_text(self._extract_task_text(result))
                title = "Проверка кода review"
            else:
                prompt = (
                    self._build_check_syntax_prompt(code, extended)
                    if normalized_check_type == "syntax"
                    else self._build_check_review_prompt(code)
                )
                result = await self.client.call_prompt(conv_id, instruction=prompt)
                clean = sanitize_text(self._extract_standard_text(result))
                title = (
                    "Проверка кода на синтаксис"
                    if normalized_check_type == "syntax"
                    else "Проверка кода review"
                )
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"{title}:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name == "modify_1c_code":
            instruction = (args.get("instruction") or "").strip()
            code = (args.get("code") or "").strip()
            if not instruction:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: instruction не может быть пустым")])
            conv_id = await self._create_isolated_conversation(session_id)
            prompt = self._build_modify_prompt(instruction, code)
            if self._use_direct_mode():
                result = await self.client.call_task(
                    conv_id,
                    instruction=prompt,
                    skill="modify",
                )
                clean = sanitize_text(self._extract_task_text(result))
            else:
                result = await self.client.call_prompt(conv_id, instruction=prompt)
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"Изменение кода:\n\n{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name in {"search_1c_documentation", "Search_1C_Documentation"}:
            query = (args.get("query") or "").strip()
            version = (args.get("version") or "v8.5.1").strip() or "v8.5.1"
            if not query:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: query не может быть пустым")])
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode():
                result = await self.client.call_exact_tool(
                    conv_id,
                    tool_name="mcp__knowledge-hub__Search_Documentation",
                    arguments={"query": query, "version": version},
                )
                clean = sanitize_text(self._extract_tool_text(result, include_tool_details=True))
            else:
                result = await self.client.call_prompt(
                    conv_id,
                    instruction=self._build_search_documentation_prompt(query, version),
                )
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name in {"search_its", "Search_ITS"}:
            query = (args.get("query") or "").strip()
            if not query:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: query не может быть пустым")])
            query_with_context = self._with_default_bsp_context(query)
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode():
                result = await self.client.call_exact_tool(
                    conv_id,
                    tool_name="mcp__knowledge-hub__Search_ITS",
                    arguments={"query": query_with_context},
                )
                clean = sanitize_text(self._extract_tool_text(result, include_tool_details=True))
            else:
                result = await self.client.call_prompt(
                    conv_id,
                    instruction=self._build_search_its_prompt(query_with_context),
                )
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name in {"fetch_its", "Fetch_ITS"}:
            item_id = (args.get("id") or "root").strip() or "root"
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode():
                result = await self.client.call_exact_tool(
                    conv_id,
                    tool_name="mcp__knowledge-hub__Fetch_ITS",
                    arguments={"id": item_id},
                )
                clean = sanitize_text(self._extract_tool_text(result, include_tool_details=True))
            else:
                result = await self.client.call_prompt(
                    conv_id,
                    instruction=self._build_fetch_its_prompt(item_id),
                )
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        if name in {
            "diff_1c_documentation_versions",
            "Diff_1C_Documentation_Versions",
        }:
            version_a = (args.get("version_a") or "").strip()
            version_b = (args.get("version_b") or "").strip()
            query = (args.get("query") or "").strip()
            if not version_a or not version_b:
                return ToolsCallResult(content=[ToolsCallTextContent(text="Ошибка: version_a и version_b обязательны")])
            conv_id = await self._create_isolated_conversation(session_id)
            if self._use_direct_mode():
                direct_args: Dict[str, Any] = {"version_a": version_a, "version_b": version_b}
                if query:
                    direct_args["query"] = query
                result = await self.client.call_exact_tool(
                    conv_id,
                    tool_name="mcp__knowledge-hub__Diff_Documentation_Versions",
                    arguments=direct_args,
                )
                clean = sanitize_text(self._extract_tool_text(result, include_tool_details=True))
            else:
                result = await self.client.call_prompt(
                    conv_id,
                    instruction=self._build_diff_prompt(version_a, version_b, query),
                )
                clean = sanitize_text(self._extract_standard_text(result))
            return ToolsCallResult(content=[ToolsCallTextContent(text=f"{clean}\n\nСессия: {session_id or '-'}\nРазговор: {conv_id}")])

        raise ToolNotFoundError(name)
