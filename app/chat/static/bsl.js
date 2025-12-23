/*!
  Enhanced BSL (1C:Enterprise) syntax highlighter for the chat UI.

  Features:
  - Comprehensive keyword support (RU/EN): procedures, functions, loops, conditionals
  - Query language support: ВЫБРАТЬ, ГДЕ, СОЕДИНЕНИЕ, СГРУППИРОВАТЬ, etc.
  - 100+ built-in types: Запрос, ТаблицаЗначений, HTTPСоединение, etc.
  - Virtual tables: Обороты, Остатки, СрезПоследних, etc.
  - 80+ global functions: Сообщить, СтрДлина, ТекущаяДата, Представление, etc.
  - Preprocessor directives: #Если, #Область, #Region
  - Compilation attributes: &НаКлиенте, &НаСервере
  - Date literals: '20250101', '20250101120000'
  - Numbers: integers, floats, scientific notation, negative numbers
  - Operators: +, -, *, /, =, <>, <=, >=
  - Strings with escape sequences ("")
  - Line comments: //
  - Enhanced auto-detection heuristics

  Exposes:
    - BSL.highlight(code: string, lang?: string): string | null
    - BSL.highlightAll(container: Element, opts?: { autodetect?: boolean, inline?: boolean })

  Safe: reads only textContent and escapes before wrapping tokens
*/
(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isWordStart(ch) {
    return /[A-Za-z_\u0410-\u044F\u0401\u0451]/.test(ch); // latin, _, cyrillic incl. Ёё
  }
  function isWordChar(ch) {
    return /[A-Za-z0-9_\u0410-\u044F\u0401\u0451]/.test(ch);
  }

  const KEYWORDS_RU = [
    "процедура", "функция", "конецпроцедуры", "конецфункции",
    "перем", "экспорт",
    "если", "тогда", "иначе", "иначеесли", "конецесли",
    "для", "каждого", "каждый", "из", "по", "пока", "цикл", "конеццикла",
    "возврат", "прервать", "продолжить",
    "попытка", "исключение", "конецпопытки", "вызватьисключение",
    "новый", "перейти",
    "и", "или", "не",
    "истина", "ложь", "неопределено", "null",
    "этотобъект",
    // Язык запросов 1С (только ключевые слова запросов, не методы)
    "как", "разрешенные", "различные", "первые", "пустаятаблица",
    "поместить", "уничтожить", "индексировать",
    "выразить", "подобно", "escape", "ссылка",
    "datetime", "иерархии", "автоупорядочивание",
    "периодами", "только", "иерархия",
    "внутреннее", "левое", "правое", "полное", "соединение",
    "где", "сгруппировать", "имеющие", "объединить", "упорядочить",
    "автоупорядочивание", "итоги", "общие", "только", "иерархия",
    "для", "изменения", "в", "количество", "сумма", "среднее",
    "максимум", "минимум", "есть", "между", "в",
    "содержит", "начинаетсяс", "заканчиваетсяна",
    "возр", "убыв", "всего",
  ];
  const KEYWORDS_EN = [
    "procedure", "function", "endprocedure", "endfunction",
    "var", "export",
    "if", "then", "else", "elseif", "endif",
    "for", "each", "in", "to", "while", "do", "enddo",
    "return", "break", "continue",
    "try", "except", "endtry", "raise",
    "new", "goto",
    "and", "or", "not",
    "true", "false", "undefined", "null",
    "thisobject",
    // Query language (only query keywords, not methods)
    "as", "allowed", "distinct", "top", "emptytable",
    "into", "drop", "index",
    "cast", "like", "escape", "refs",
    "value", "datetime", "hierarchies", "autoorder",
    "periods", "only", "hierarchy",
    "inner", "left", "right", "full", "join",
    "where", "group", "by", "having", "union", "order",
    "autoorder", "totals", "overall", "only", "hierarchy",
    "for", "update", "of", "count", "sum", "avg",
    "max", "min", "is", "between", "in",
    "contains", "beginswith", "endswith",
    "asc", "desc", "total",
  ];
  const KEYWORDS = new Set([...KEYWORDS_RU, ...KEYWORDS_EN].map((s) => s.toLowerCase()));

  // Ключевые слова, которые подсвечиваются ТОЛЬКО когда написаны ЗАГЛАВНЫМИ буквами
  // (используется для различения ключевых слов языка запросов от методов)
  const UPPERCASE_ONLY_KEYWORDS = new Set([
    "выбрать", // ВЫБРАТЬ - ключевое слово запроса, Выбрать - метод
    "выбор",   // ВЫБОР - ключевое слово запроса (CASE в SQL)
    "когда",   // КОГДА - ключевое слово запроса (WHEN в SQL)
    "конец",   // КОНЕЦ - ключевое слово запроса (END в SQL)
  ]);

  const TYPES_RU = [
    // HTTP и сеть
    "httpсоединение", "httpзапрос", "httpответ", "ftpсоединение", "wsпрокси",
    "интернетпрокси", "защищенноесоединениеopenssl",
    // Коллекции и структуры данных
    "таблицазначений", "колонкатаблицызначений", "коллекциязначений",
    "соответствие", "массив", "структура", "фиксированныймассив", "фиксированнаяструктура",
    "списокзначений", "деревозначений", "строкадеревазначений",
    // Работа с данными
    "запрос", "выборка", "построительзапроса", "построительотчета", "схемазапроса",
    "менеджервременныхтаблиц", "описаниетипов", "квалификаторыстроки", "квалификаторычисла",
    "квалификаторыдаты", "квалификаторыдвоичныхданных",
    // Виртуальные таблицы и таблицы из метаданных (в запросах)
    "оборотыдт", "оборотыдткт", "обороты", "остатки", "остаткиивороты",
    "границы", "срезпервых", "срезпоследних",
    // Регистры
    "записьрегистра", "наборзаписей", "менеджерзаписи",
    // Примитивные типы
    "строка", "число", "дата", "булево", "тип",
    // Хранение и обмен данных
    "хранилищезначения", "двоичныеданные", "буфердвоичныхданных",
    "xmlчтение", "xmlзапись", "чтениеjson", "записьjson", "чтениеданных", "записьданных",
    "чтениетекста", "записьтекста", "текстовыйдокумент", "форматированныйдокумент",
    "табличныйдокумент", "построительтабличногодокумента",
    // Файлы и потоки
    "файл", "файловыйпоток", "каталог", "поискфайлов", "zipфайл",
    // UI и формы
    "управляемаяформа", "формаклиентскогоприложения", "командаформы", "элементформы",
    "таблицаформы", "группаформы", "кнопкаформы", "полеформы",
    // Другие важные типы
    "соединение", "comобъект", "фоновоезадание", "wsссылка", "wsопределения",
    "сериализаторxdto", "фабрикаxdto", "объектxdto",
    "уникальныйидентификатор", "граница", "точкавовремени",
    "форматированнаястрока", "картинка", "шрифт", "цвет",
    "хешированиеданных", "шифрованиеданных", "электроннаяподпись", "сертификатклиента",
    "сообщениепользователю", "диалогвыборафайла", "диалогредактированияформатированнойстроки",
  ];
  const TYPES_EN = [
    "httpconnection", "httprequest", "httpresponse", "ftpconnection", "wsproxy",
    "array", "structure", "fixedarray", "fixedstructure", "map",
    "valuetable", "valuetree", "valuelist",
    "query", "querybuilder", "queryschema", "selection",
    "type", "typedescription",
    "file", "binarydata", "textreader", "textwriter",
    "xmlreader", "xmlwriter", "jsonreader", "jsonwriter",
    "uuid", "boundary", "formatstring", "picture",
  ];
  const TYPES = new Set([...TYPES_RU, ...TYPES_EN].map((s) => s.toLowerCase()));

  // Глобальные функции 1С (часто используемые)
  const BUILTINS_RU = [
    // Работа со строками
    "стрдлина", "стрнайти", "стрполучитьстроку", "стрразделить", "стрсоединить",
    "стрзаменить", "стршаблон", "стрначинаетсяс", "стрзаканчиваетсяна",
    "сокрл", "сокрп", "сокрлп", "врег", "нрег", "трег", "симв", "кодсимв",
    "пустаястрока", "стрсравнить", "стрчислострок", "стрчисловхождений", "стрповторить",
    "подстрока", "представление", "стрзаканчиваетсяна", "лев", "прав", "сред",
    "нстр",
    // Регулярные выражения
    "стрсоответствуетшаблону", "стрнайтирегулярноевыражение", "стрзаменитьрегулярноевыражение", "стрразделитьрегулярноевыражение",
    // Работа с числами
    "число", "цел", "окр", "округлить", "макс", "мин", "формат", "pow", "sqrt", "log", "log10", "exp",
    "sin", "cos", "tan", "asin", "acos", "atan", "abs", "случайноечисло",
    // Работа с датами
    "дата", "год", "месяц", "день", "час", "минута", "секунда", "деньгода", "деньнедели",
    "неделягода", "началогода", "началомесяца", "началоквартала", "началонедели",
    "началодня", "началочаса", "началоминуты", "конецгода", "конецмесяца", "конецквартала",
    "конецнедели", "конецдня", "конецчаса", "конецминуты", "добавитьмесяц", "добавитькдате",
    "текущаядата", "текущаядатасеанса", "рабочаядата", "универсальноевремя",
    // Работа с типами
    "тип", "типзнч", "строка", "булево", "xmlтип", "xmlтипзнч", "xmlзначение", "xmlстрока",
    // Диалоги и сообщения
    "сообщить", "вопрос", "предупреждение", "оповестить", "оповеститьобизменении",
    "установитьзаголовокклиентскогоприложения", "состояние", "активизироватьокно", "активноеокно",
    "ввестидату", "ввестизначение", "ввестистроку", "ввестичисло",
    "показатьвводдаты", "показатьвводзначения", "показатьвводстроки", "показатьвводчисла",
    "показатьпредупреждение", "показатьоповещениепользователя", "показатьинформациюобошибке",
    "открытьформу", "открытьзначение", "открытьформумодально", "получитьформу", "получитьнавигационнуюссылку",
    "открытьсправку", "закрытьсправку", "открытьсодержаниесправки", "открытьиндекссправки",
    "сигнал", "обработкапрерыванияпользователя",
    "краткоепредставлениеошибки", "подробноепредставлениеошибки", "описатьошибку",
    // Работа с коллекциями (только глобальные функции, не методы)
    "новый",
    // Примечание: количество, получить, вставить, добавить, удалить, очистить, найти - это методы коллекций, не глобальные функции
    // Работа со значениями
    "значение", "значениезаполнено", "заполнитьзначениясвойств", "скопироватьзначения",
    "значениевстрокувнутр", "значениеизстрокивнутр",
    "значениевфайл", "значениеизфайла",
    "восстановитьзначение", "сохранитьзначение",
    "очиститьнастройкипользователя", "удалитьнастройкипользователя",
    // Работа с XML/JSON
    "прочитатьjson", "записатьjson", "xdtoсериализатор", "xdtoфабрика",
    "прочитатьxml", "записатьxml", "возможностьчтенияxml", "найтинедопустимыесимволыxml",
    "получитьxmlтип", "изxmlтипа", "импортмоделиxdto", "создатьфабрикуxdto",
    // Работа с файлами
    "объединитьпути", "разъединитьпути", "каталогвременныхфайлов", "каталогдокументов", "каталогпрограммы",
    "получитьимявременногофайла", "разделитьфайл", "объединитьфайлы", "файлсуществует", "найтифайлы",
    "копироватьфайл", "переместитьфайл", "удалитьфайлы", "создатькаталог",
    "получитьфайл", "получитьфайлы", "поместитьфайл", "поместитьфайлы",
    "получитьизвременногохранилища", "поместитьвовременноехранилище", "этоадресвременногохранилища",
    "получитьвременноехранилище",
    "подключитьрасширениеработысфайлами", "установитьрасширениеработысфайлами",
    "запроситьразрешениепользователя",
    // Транзакции и блокировки
    "началотранзакции", "зафиксироватьтранзакцию", "отменитьтранзакцию",
    "заблокироватьданныедляредактирования", "разблокироватьданныедляредактирования",
    "получитьблокировкусеансов", "установитьблокировкусеансов",
    "получитьвремяожиданияблокировкиданных", "установитьвремяожиданияблокировкиданных",
    // Работа с базой данных
    "установитьмонопольныйрежим", "монопольныйрежим", "установитьпривилегированныйрежим", "привилегированныйрежим",
    "пользователиинформационнойбазы", "рольдоступна", "правоДоступа",
    "безопасныйрежим", "установитьбезопасныйрежим",
    "кодлокализацииинформационнойбазы", "конфигурацияизменена", "конфигурациябазыданныхизмененадинамически",
    "необходимостьзавершениясоединения", "номерсеансаинформационнойбазы", "номерсоединенияинформационнойбазы",
    "обновитьнумерациюобъектов", "обновитьповторноиспользуемыезначения",
    "получитьсеансыинформационнойбазы", "получитьсоединенияинформационнойбазы",
    "получитьчасовойпоясинформационнойбазы", "установитьчасовойпоясинформационнойбазы",
    "получитьминимальнуюдлинупаролейпользователей", "установитьминимальнуюдлинупаролейпользователей",
    "получитьпроверкусложностипаролейпользователей", "установитьпроверкусложностипаролейпользователей",
    "получитьоперативнуюотметкувремени", "получитьданныевыбора",
    "разорватьсоединениесвнешнимисточникомданных", "установитьсоединениесвнешнимисточникомданных",
    "удалитьизвременногохранилища",
    // Журнал регистрации
    "выгрузитьжурналрегистрации", "получитьзначенияотборажурналарегистрации",
    "получитьиспользованиежурналарегистрации", "получитьиспользованиесобытияжурналарегистрации",
    "представлениесобытияжурналарегистрации", "установитьиспользованиежурналарегистрации",
    "установитьиспользованиесобытияжурналарегистрации",
    // Безопасное хранилище
    "записатьвбезопасноехранилище", "прочитатьизбезопасногохранилища", "удалитьизбезопасногохранилища",
    // Работа с операционной системой
    "запуститьприложение", "командасистемы", "получитьcomобъект", "пользовательос",
    // Работа с универсальными объектами и формами
    "данныеформывзначение", "значениевданныеформы", "копироватьданныеформы",
    "получитьсоответствиеобъектаиформы", "установитьсоответствиеобъектаиформы",
    // Функциональные опции
    "обновитьинтерфейс", "получитьфункциональнуюопцию", "получитьфункциональнуюопциюинтерфейса",
    "получитьпараметрфункциональныхопцийинтерфейса", "установитьпараметрыфункциональныхопцийинтерфейса",
    // Сеанс работы
    "выполнитьпроверкуправдоступа", "заблокироватьработупользователя", "запуститьсистему",
    "отключитьобработчикожидания", "отключитьобработчикоповещения",
    "подключитьобработчикожидания", "подключитьобработчикоповещения",
    "параметрдоступа", "полноеимяпользователя", "получитьскоростьклиентскогосоединения",
    "получитьсообщенияпользователю", "представлениеприва", "представлениеприложения",
    "прекратитьработусистемы", "строкасоединенияинформационнойбазы",
    "текущийкодлокализации", "текущийрежимзапуска", "текущийязык",
    "установитьчасовойпояссеанса", "часовойпояссеанса",
    // Разное
    "вычислить", "выполнить", "eval", "спящийрежим", "завершитьработусистемы",
    "имякомпьютера", "имяпользователя", "строка", "формат", "base64значение", "base64строка",
    "получитьобщиймакет", "получитьобщуюформу", "получитьполноеимяпредопределенногозначения",
    "предопределенноезначение", "установитьвнешнююкомпоненту", "подключитьвнешнююкомпоненту",
    "найтипомеченныенаудаление", "найтиссылки", "периодстроки",
    "выполнитьобработкузаданий", "информацияобошибке", "описаниеошибки",
    "местноевремя", "текущаяуниверсальнаядата", "часовойпояс",
    "смещениелетнеговремени", "смещениестандартноговремени",
    "получитьдопустимыекодылокализации", "получитьдопустимыечасовыепояса",
    "представлениекодалокализации", "представлениечасовогопояса",
    "найтиокнопонавигационнойссылке", "перейтипонавигационнойссылке",
    "получитьокна", "получитьпредставлениенавигационнойссылок", "получитьмакетоформления",
  ];
  const BUILTINS_EN = [
    // Strings
    "strlen", "strfind", "strgetline", "strsplit", "strconcat", "strreplace", "strtemplate",
    "trimall", "triml", "trimr", "upper", "lower", "title",
    "emptystring", "strcompare", "strlinecount", "number", "format",
    // Numbers
    "int", "round", "max", "min", "pow", "sqrt", "log", "exp", "sin", "cos", "tan",
    // Dates
    "date", "year", "month", "day", "hour", "minute", "second", "currentdate",
    "begofyear", "begofmonth", "begofday", "endofyear", "endofmonth", "endofday", "addmonth",
    // Types
    "type", "typeof", "string", "boolean", "xmltype", "xmlvalue", "xmlstring",
    // Dialogs
    "message", "alert", "question", "notify", "status",
    // Collections (only global functions, not methods)
    "new",
    // Note: count, get, insert, add, delete, clear, find - these are collection methods, not global functions
    // Values
    "isfilled", "fillpropertyvalues",
    // Other
    "eval", "execute",
  ];
  const BUILTINS = new Set([...BUILTINS_RU, ...BUILTINS_EN].map((s) => s.toLowerCase()));

  function likelyBSL(text) {
    // Enhanced heuristic for BSL code detection; 2+ triggers
    let score = 0;

    // Структура функций и процедур (сильные индикаторы)
    if (/\b(Процедура|Procedure)\b/i.test(text)) score += 2;
    if (/\b(Функция|Function)\b/i.test(text)) score += 2;
    if (/\b(КонецПроцедуры|EndProcedure)\b/i.test(text)) score += 2;
    if (/\b(КонецФункции|EndFunction)\b/i.test(text)) score += 2;

    // Условия и циклы
    if (/\b(Если|If)\b/i.test(text) && /\b(Тогда|Then)\b/i.test(text)) score++;
    if (/\b(Для|For)\b/i.test(text) && /\b(Каждого|Each)\b/i.test(text)) score++;
    if (/\b(Цикл|Do)\b/i.test(text)) score++;
    if (/\b(КонецЦикла|EndDo)\b/i.test(text)) score++;

    // Типы данных 1С
    if (/\b(Запрос|Query)\b/i.test(text)) score++;
    if (/\b(ТаблицаЗначений|ValueTable)\b/i.test(text)) score++;
    if (/\b(Выборка|Selection)\b/i.test(text)) score++;
    if (/\b(Соответствие|Map)\b/i.test(text)) score++;

    // Атрибуты компиляции
    if (/&\s*На(Клиенте|Сервере|СервереВКлиенте|СервереБезКонтекста)/i.test(text)) score += 2;
    if (/&\s*At(Client|Server|ServerNoContext)/i.test(text)) score += 2;

    // Препроцессор
    if (/#(Если|Область|If|Region)\b/i.test(text)) score++;

    // Глобальные функции 1С
    if (/\b(Сообщить|Message|ТекущаяДата|CurrentDate)\b/i.test(text)) score++;
    if (/\b(СтрДлина|StrLen|СтрНайти|StrFind)\b/i.test(text)) score++;

    // Даты в формате 1С
    if (/'[0-9]{8}([0-9]{6})?'/.test(text)) score++;

    return score >= 2;
  }

  function highlightBSL(code) {
    let out = "";
    const len = code.length;
    let i = 0;

    while (i < len) {
      const ch = code[i];

      // Strings: "..." and dates: '20250101' or '20250101120000'
      if (ch === "\"" || ch === "'") {
        const quote = ch;
        let j = i + 1;
        while (j < len) {
          if (code[j] === quote) {
            // BSL escapes quotes by doubling them ("" or '')
            if (code[j + 1] === quote) {
              j += 2;
              continue;
            }
            j++;
            break;
          }
          j++;
        }
        const content = code.slice(i, j);
        // Check if it's a date literal (single quotes with digits)
        const isDate = quote === "'" && /^'[0-9]{8}([0-9]{6})?'$/.test(content);
        const cssClass = isDate ? "tok-num" : "tok-str";
        out += '<span class="' + cssClass + '">' + esc(content) + "</span>";
        i = j;
        continue;
      }

      // Line comments: //...
      if (ch === "/" && code[i + 1] === "/") {
        let j = i + 2;
        while (j < len && code[j] !== "\n") j++;
        out += '<span class="tok-com">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // Preprocessor directives: #Если, #Область, etc.
      if (ch === "#") {
        let j = i + 1;
        while (j < len && /[A-Za-z_\u0410-\u044F\u0401\u0451]/.test(code[j])) j++;
        out += '<span class="tok-preproc">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // Attributes / directives: &НаКлиенте, &НаСервере ...
      if (ch === "&") {
        let j = i + 1;
        while (j < len && /[A-Za-z_\u0410-\u044F\u0401\u0451]/.test(code[j])) j++;
        out += '<span class="tok-attr">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // Numbers (including floats and negative numbers)
      if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(code[i + 1]))) {
        const prev = i > 0 ? code[i - 1] : "";
        // Check if it's actually a number (not part of identifier)
        if (!isWordChar(prev) && !/[.)]/.test(prev)) {
          let j = i;
          // Handle negative sign
          if (code[j] === "-") j++;
          // Integer part
          while (j < len && /[0-9]/.test(code[j])) j++;
          // Decimal part
          if (code[j] === "." && /[0-9]/.test(code[j + 1])) {
            j++;
            while (j < len && /[0-9]/.test(code[j])) j++;
          }
          // Scientific notation (e.g., 1.23e-10)
          if ((code[j] === "e" || code[j] === "E") && /[0-9+-]/.test(code[j + 1])) {
            j++;
            if (code[j] === "+" || code[j] === "-") j++;
            while (j < len && /[0-9]/.test(code[j])) j++;
          }
          out += '<span class="tok-num">' + esc(code.slice(i, j)) + "</span>";
          i = j;
          continue;
        }
      }

      // Identifiers / keywords / types / builtins
      if (isWordStart(ch)) {
        let j = i + 1;
        while (j < len && isWordChar(code[j])) j++;
        const word = code.slice(i, j);
        const lw = word.toLowerCase();

        // Check context: what comes before and after this word?
        let prevWord = "";
        let isAfterDot = false;
        let k = i - 1;

        // Check if there's a dot IMMEDIATELY before (no whitespace)
        if (k >= 0 && code[k] === ".") {
          isAfterDot = true;
        }

        // Skip whitespace backwards
        while (k >= 0 && /[ \t\r\n]/.test(code[k])) k--;

        if (k >= 0 && !isAfterDot) {
          if (code[k] === ".") {
            // This dot is separated by whitespace, ignore it
            // (could be end of comment like "// ...")
            isAfterDot = false;
          } else if (isWordChar(code[k])) {
            // Find the previous word
            let wordEnd = k + 1;
            while (k >= 0 && isWordChar(code[k])) k--;
            prevWord = code.slice(k + 1, wordEnd).toLowerCase();
          }
        }

        // Check what comes after this word (skip whitespace)
        let afterIdx = j;
        while (afterIdx < len && /[ \t\r\n]/.test(code[afterIdx])) afterIdx++;
        const isBeforeParen = afterIdx < len && code[afterIdx] === "(";

        // Check if this is an uppercase-only keyword
        if (UPPERCASE_ONLY_KEYWORDS.has(lw) && !isAfterDot && word === word.toUpperCase()) {
          // Only highlight if the word is written in ALL UPPERCASE
          out += '<span class="tok-k">' + esc(word) + "</span>";
        } else if (KEYWORDS.has(lw) && !isAfterDot) {
          // Only highlight keywords if NOT after dot (not a property)
          out += '<span class="tok-k">' + esc(word) + "</span>";
        } else if (TYPES.has(lw) && prevWord === "новый") {
          // Only highlight types after "Новый" keyword
          out += '<span class="tok-type">' + esc(word) + "</span>";
        } else if (BUILTINS.has(lw) && !isAfterDot && (lw === "новый" || isBeforeParen)) {
          // Only highlight as builtin if:
          // 1. NOT a method call (not after dot)
          // 2. Either it's "новый" OR there's a parenthesis after it (function call)
          out += '<span class="tok-builtin">' + esc(word) + "</span>";
        } else {
          out += esc(word);
        }
        i = j;
        continue;
      }

      // Operators: +, -, *, /, %, =, <>, <, >, <=, >=
      if (/[+\-*/%=<>]/.test(ch)) {
        let j = i + 1;
        // Handle multi-char operators: <>, <=, >=
        if ((ch === "<" || ch === ">") && code[j] === "=") j++;
        else if (ch === "<" && code[j] === ">") j++;
        out += '<span class="tok-op">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // Default char
      out += esc(ch);
      i++;
    }

    return out;
  }

  function highlight(code, lang /* optional */) {
    const force = !!(lang && /^(bsl|1c)$/i.test(lang));
    if (!force && !likelyBSL(code)) return null;
    return highlightBSL(code);
  }

  function highlightAll(container, opts) {
    opts = opts || {};
    const autodetect = opts.autodetect !== false;

    // ALWAYS use "pre code" to avoid breaking inline code
    const selector = "pre code";
    const nodes = container.querySelectorAll(selector);
    for (const codeEl of nodes) {
      const cls = codeEl.className || "";
      const forced = /lang-(bsl|1c)/i.test(cls);
      const text = codeEl.textContent || "";
      if (!text) continue;

      // Skip if already highlighted by XML or other highlighter
      if (codeEl.classList.contains("lang-xml")) {
        continue;
      }

      let doIt = forced || (autodetect && likelyBSL(text));
      if (!doIt) continue;

      const lang = forced ? "bsl" : undefined;
      const html = highlight(text, lang);
      if (html != null) {
        codeEl.innerHTML = html;
        codeEl.classList.add("lang-bsl");
      }
    }
  }

  window.BSL = {
    highlight,
    highlightAll,
  };
})();