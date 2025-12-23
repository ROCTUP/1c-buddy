/*!
  Enhanced XML syntax highlighter for the chat UI.

  Features:
  - XML declarations: <?xml version="1.0" encoding="UTF-8"?>
  - Processing instructions: <?target data?>
  - Tags: <element>, </element>, <self-closing/>
  - Attributes: name="value", attr='value'
  - Namespaces: <ns:element xmlns:ns="...">
  - CDATA sections: <![CDATA[...]]>
  - Comments: <!-- ... -->
  - Entities: &lt;, &amp;, &#123;, &#x7B;
  - DOCTYPE declarations: <!DOCTYPE html>
  - Enhanced auto-detection heuristics

  Exposes:
    - XML.highlight(code: string, lang?: string): string | null
    - XML.highlightAll(container: Element, opts?: { autodetect?: boolean, inline?: boolean })

  Safe: reads only textContent and escapes before wrapping tokens
*/
(function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function likelyXML(text) {
    // Enhanced heuristic for XML code detection; 2+ triggers
    let score = 0;

    // Strong indicators
    if (/^<\?xml\s/i.test(text.trim())) score += 3; // XML declaration at start
    if (/<!\[CDATA\[/.test(text)) score += 2; // CDATA section
    if (/<!DOCTYPE\s/i.test(text)) score += 2; // DOCTYPE declaration

    // Paired tags
    const openTags = text.match(/<([a-zA-Z][\w:.-]*)/g) || [];
    const closeTags = text.match(/<\/([a-zA-Z][\w:.-]*)/g) || [];
    if (openTags.length > 0 && closeTags.length > 0) score += 2;

    // Self-closing tags
    if (/<[a-zA-Z][\w:.-]*[^>]*\/>/.test(text)) score++;

    // Namespaces
    if (/xmlns(:[a-zA-Z][\w.-]*)?=/.test(text)) score += 2;

    // Processing instructions
    if (/<\?[a-zA-Z][\w.-]*/.test(text)) score++;

    // Comments
    if (/<!--[\s\S]*?-->/.test(text)) score++;

    // Attributes
    if (/\s[a-zA-Z][\w:.-]*\s*=\s*["']/.test(text)) score++;

    // Entities
    if (/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/.test(text)) score++;

    return score >= 2;
  }

  function highlightXML(code) {
    let out = "";
    const len = code.length;
    let i = 0;

    while (i < len) {
      const ch = code[i];

      // Comments: <!-- ... -->
      if (ch === "<" && code.slice(i, i + 4) === "<!--") {
        let j = code.indexOf("-->", i + 4);
        if (j === -1) j = len;
        else j += 3;
        out += '<span class="tok-com">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // CDATA: <![CDATA[ ... ]]>
      if (ch === "<" && code.slice(i, i + 9) === "<![CDATA[") {
        let j = code.indexOf("]]>", i + 9);
        if (j === -1) j = len;
        else j += 3;
        out += '<span class="tok-xml-cdata">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // DOCTYPE: <!DOCTYPE ...>
      if (ch === "<" && code.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
        let j = i + 9;
        let depth = 1;
        while (j < len && depth > 0) {
          if (code[j] === "<") depth++;
          else if (code[j] === ">") depth--;
          j++;
        }
        out += '<span class="tok-xml-doctype">' + esc(code.slice(i, j)) + "</span>";
        i = j;
        continue;
      }

      // Processing instructions: <?xml ... ?> or <?target ... ?>
      if (ch === "<" && code[i + 1] === "?") {
        let j = code.indexOf("?>", i + 2);
        if (j === -1) j = len;
        else j += 2;
        const pi = code.slice(i, j);
        const isXmlDecl = /^<\?xml\s/i.test(pi);
        const cssClass = isXmlDecl ? "tok-xml-decl" : "tok-xml-pi";
        out += '<span class="' + cssClass + '">' + esc(pi) + "</span>";
        i = j;
        continue;
      }

      // Tags: <element ...>, </element>, <element/>
      if (ch === "<" && /[a-zA-Z/]/.test(code[i + 1])) {
        let j = i + 1;
        const isClosing = code[j] === "/";
        if (isClosing) j++;

        // Tag name (may include namespace: ns:element)
        const tagStart = j;
        while (j < len && /[a-zA-Z0-9:._-]/.test(code[j])) j++;
        const tagName = code.slice(tagStart, j);

        // Opening bracket and tag name
        out += '<span class="tok-xml-tag">' + esc("<" + (isClosing ? "/" : "") + tagName) + "</span>";

        // Skip whitespace
        while (j < len && /\s/.test(code[j])) {
          out += esc(code[j]);
          j++;
        }

        // Attributes (for opening tags and self-closing tags)
        if (!isClosing) {
          while (j < len && code[j] !== ">" && !(code[j] === "/" && code[j + 1] === ">")) {
            // Attribute name
            const attrStart = j;
            while (j < len && /[a-zA-Z0-9:._-]/.test(code[j])) j++;
            if (j > attrStart) {
              const attrName = code.slice(attrStart, j);
              out += '<span class="tok-xml-attr">' + esc(attrName) + "</span>";
            }

            // Skip whitespace
            while (j < len && /\s/.test(code[j])) {
              out += esc(code[j]);
              j++;
            }

            // = sign
            if (code[j] === "=") {
              out += esc("=");
              j++;

              // Skip whitespace
              while (j < len && /\s/.test(code[j])) {
                out += esc(code[j]);
                j++;
              }

              // Attribute value: "..." or '...'
              if (code[j] === '"' || code[j] === "'") {
                const quote = code[j];
                let k = j + 1;
                while (k < len && code[k] !== quote) k++;
                if (k < len) k++; // include closing quote
                out += '<span class="tok-xml-val">' + esc(code.slice(j, k)) + "</span>";
                j = k;
              }
            }

            // Skip whitespace
            while (j < len && /\s/.test(code[j])) {
              out += esc(code[j]);
              j++;
            }
          }
        }

        // Self-closing or closing bracket
        if (code[j] === "/" && code[j + 1] === ">") {
          out += '<span class="tok-xml-tag">/&gt;</span>';
          j += 2;
        } else if (code[j] === ">") {
          out += '<span class="tok-xml-tag">&gt;</span>';
          j++;
        }

        i = j;
        continue;
      }

      // Entities: &lt;, &amp;, &#123;, &#x7B;
      if (ch === "&") {
        let j = i + 1;
        // Named entity or numeric entity
        if (code[j] === "#") {
          j++;
          if (code[j] === "x" || code[j] === "X") {
            j++;
            while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
          } else {
            while (j < len && /[0-9]/.test(code[j])) j++;
          }
        } else {
          while (j < len && /[a-zA-Z0-9]/.test(code[j])) j++;
        }
        if (code[j] === ";") {
          j++;
          out += '<span class="tok-xml-entity">' + esc(code.slice(i, j)) + "</span>";
          i = j;
          continue;
        }
      }

      // Default char
      out += esc(ch);
      i++;
    }

    return out;
  }

  function highlight(code, lang /* optional */) {
    const force = !!(lang && /^xml$/i.test(lang));
    if (!force && !likelyXML(code)) return null;
    return highlightXML(code);
  }

  function highlightAll(container, opts) {
    opts = opts || {};
    const autodetect = opts.autodetect !== false;

    // ALWAYS use "pre code" to avoid breaking inline code
    const selector = "pre code";
    const nodes = container.querySelectorAll(selector);
    for (const codeEl of nodes) {
      const cls = codeEl.className || "";
      const forced = /lang-xml/i.test(cls);
      const text = codeEl.textContent || "";
      if (!text) continue;

      // Skip if already highlighted by BSL or other highlighter
      if (codeEl.classList.contains("lang-bsl") || codeEl.classList.contains("lang-1c")) {
        continue;
      }

      let doIt = forced || (autodetect && likelyXML(text));
      if (!doIt) continue;

      const lang = forced ? "xml" : undefined;
      const html = highlight(text, lang);
      if (html != null) {
        codeEl.innerHTML = html;
        codeEl.classList.add("lang-xml");
      }
    }
  }

  window.XML = {
    highlight,
    highlightAll,
  };
})();
