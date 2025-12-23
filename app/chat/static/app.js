(() => {
  const chatEl = document.getElementById("chat");
  const form = document.getElementById("send-form");
  const input = document.getElementById("message-input");
  const sendStopBtn = document.getElementById("send-stop-btn");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const searchBtn = document.getElementById("search-btn");
  const exportBtn = document.getElementById("export-btn");
  const searchContainer = document.getElementById("search-container");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const closeSearchBtn = document.getElementById("close-search-btn");
  const statusEl = document.getElementById("status");
  const sessionIdEl = document.getElementById("session-id");

  // Sidebar elements
  const sidebar = document.getElementById("sidebar");
  const conversationsList = document.getElementById("conversations-list");
  const newConversationBtn = document.getElementById("new-conversation-btn");
  const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
  const mobileToggleBtn = document.getElementById("mobile-toggle-sidebar");
  const desktopToggleBtn = document.getElementById("desktop-toggle-sidebar");
  const clearAllConversationsBtn = document.getElementById("clear-all-conversations-btn");

  // Initialize Conversations Manager
  const conversationsManager = new window.ConversationsManager();
  
  // Make conversationsManager available globally for FileViewer
  window.conversationsManager = conversationsManager;

  let convId = ""; // API conversation_id
  let forceNewSession = false;
  let streaming = false;
  let currentAssistantBubble = null;
  let currentEventSource = null;

  const HISTORY_LIMIT = 500;

  // Token accumulation for current conversation
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Mermaid initialization and rendering
  function initMermaid() {
    if (window.mermaid && !window.__mermaidInitialized) {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#1e1e1e',
            primaryColor: '#4a9eff',
            primaryTextColor: '#e4e4e4',
            primaryBorderColor: '#555',
            lineColor: '#888',
            secondaryColor: '#2d2d30',
            tertiaryColor: '#252526'
          },
          suppressErrorRendering: true,
          logLevel: 'fatal'
        });
        window.__mermaidInitialized = true;
      } catch (e) {
        console.error('Mermaid initialization error:', e);
      }
    }
  }

  // Sanitize and normalize Mermaid code to fix common syntax issues
  function sanitizeMermaidCode(code) {
    // Decode HTML entities that might have been encoded
    const textarea = document.createElement('textarea');
    textarea.innerHTML = code;
    let sanitized = textarea.value;

    // Fix common Mermaid syntax issues that cause parse errors:

    // 1. Remove ALL double quotes from edge labels (text on arrows)
    // This is the most aggressive and reliable approach
    // Process line by line to handle edge labels properly
    const lines = sanitized.split('\n');
    sanitized = lines.map(line => {
      // Check if line contains edge arrows (-->, --->, -.->)
      if (line.includes('-->') || line.includes('--->') || line.includes('-.->')) {
        // Simply remove ALL regular quotes from lines with arrows
        // Node text quotes are already replaced with DOUBLE PRIME (″) in markdown.js
        // so this only affects edge labels which should not have quotes
        return line.replace(/"/g, '');
      }
      return line;
    }).join('\n');

    // 2. Sanitize content ONLY inside curly braces {...} (condition/decision nodes)
    // Leave square brackets in node definitions like A[text] - they are valid Mermaid syntax!
    sanitized = sanitized.replace(/\{([^}]+)\}/g, function(_m, conditionText) {
      let cleaned = conditionText;

      // Remove <br> tags - Mermaid doesn't support line breaks inside condition nodes
      // Replace with space to keep words separated
      cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ');

      // Replace array bracket notation: Массив[j] -> Массив_j
      cleaned = cleaned.replace(/([А-Яа-яA-Za-z_0-9]+)\[([^\]]+)\]/g, '$1_$2');

      // Remove empty parentheses from function names: Количество() -> Количество
      cleaned = cleaned.replace(/([А-Яа-яA-Za-z_0-9]+)\(\)/g, '$1');

      // Replace comparison operators with visually similar Unicode characters
      // This prevents HTML parsing issues while keeping the operators readable
      cleaned = cleaned
        .replace(/\s*<=\s*/g, ' ≤ ')   // U+2264 LESS-THAN OR EQUAL TO
        .replace(/\s*>=\s*/g, ' ≥ ')   // U+2265 GREATER-THAN OR EQUAL TO
        .replace(/\s*<\s*/g, ' ‹ ')    // U+2039 SINGLE LEFT-POINTING ANGLE QUOTATION MARK
        .replace(/\s*>\s*/g, ' › ')    // U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
        .replace(/\s*!=\s*/g, ' ≠ ')   // U+2260 NOT EQUAL TO
        .replace(/\s*==\s*/g, ' = ');

      // Clean up extra whitespace
      cleaned = cleaned.replace(/\s+/g, ' ').trim();

      return '{' + cleaned + '}';
    });

    // 3. More aggressive global cleanups

    // Remove ALL semicolons - they're not valid Mermaid syntax anywhere
    sanitized = sanitized.replace(/;/g, '');

    // Remove empty parentheses everywhere (not just in conditions)
    // Pattern: word() -> word
    sanitized = sanitized.replace(/([А-Яа-яA-Za-z_0-9]+)\(\)/g, '$1');

    // Replace dots in identifiers with underscores (Массив.Количество -> Массив_Количество)
    // But only if they're part of word.word pattern, not standalone dots
    sanitized = sanitized.replace(/([А-Яа-яA-Za-z_0-9]+)\.([А-Яа-яA-Za-z_0-9]+)/g, '$1_$2');

    return sanitized.trim();
  }

  async function renderMermaidDiagrams(container) {
    if (!window.mermaid) return;

    initMermaid();

    try {
      const mermaidDivs = container.querySelectorAll('.mermaid:not([data-processed])');
      for (let i = 0; i < mermaidDivs.length; i++) {
        const div = mermaidDivs[i];
        const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);

        // Get code from data attribute or textContent
        let code = div.getAttribute('data-mermaid-code') || div.textContent;

        // Sanitize code to fix common syntax issues
        code = sanitizeMermaidCode(code);

        try {
          const { svg } = await window.mermaid.render(id, code);
          div.innerHTML = svg;
          div.setAttribute('data-processed', 'true');
        } catch (err) {
          // Show error with original and sanitized code for debugging
          div.innerHTML = '<pre style="color:#ff6b6b;padding:1rem;background:#2d1f1f;border-radius:4px;">Ошибка рендеринга диаграммы:\n' +
                          err.message + '\n\nПопробуйте упростить синтаксис диаграммы.</pre>';
          div.setAttribute('data-processed', 'true');
          div.setAttribute('data-error', 'true');
          div.setAttribute('data-error-message', err.message);

          // Add "Fix" button for diagrams with errors
          const wrapper = div.closest('.mermaid-wrapper');
          if (wrapper) {
            const controlsDiv = wrapper.querySelector('.mermaid-controls');
            if (controlsDiv) {
              // Create fix button and insert it at the beginning of controls
              const fixBtn = document.createElement('button');
              fixBtn.type = 'button';
              fixBtn.className = 'mermaid-fix-btn';
              fixBtn.title = 'Исправить диаграмму';
              fixBtn.setAttribute('aria-label', 'Исправить диаграмму');
              fixBtn.setAttribute('data-fix-mermaid', '');
              fixBtn.style.cssText = 'padding:4px 8px;border-radius:6px;' +
                                     'border:1px solid rgba(255,255,255,0.18);background:rgba(255,165,0,0.15);' +
                                     'color:inherit;cursor:pointer;font-size:12px;line-height:1;opacity:.85;';
              fixBtn.textContent = '🔧';

              // Insert at the beginning of controls
              controlsDiv.insertBefore(fixBtn, controlsDiv.firstChild);
            }
          }

          console.error('Mermaid parse error:', err, '\nSanitized code:', code);
        }
      }
    } catch (e) {
      console.error('Mermaid rendering error:', e);
    }
  }

  // Helper functions for send/stop button state
  function setSendMode() {
    const sendIcon = sendStopBtn.querySelector('.send-icon');
    const stopIcon = sendStopBtn.querySelector('.stop-icon');
    sendIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    sendStopBtn.classList.remove('stop-mode');
    sendStopBtn.disabled = false;
    sendStopBtn.title = 'Отправить';
  }

  function setStopMode() {
    const sendIcon = sendStopBtn.querySelector('.send-icon');
    const stopIcon = sendStopBtn.querySelector('.stop-icon');
    sendIcon.style.display = 'none';
    stopIcon.style.display = 'block';
    sendStopBtn.classList.add('stop-mode');
    sendStopBtn.disabled = false;
    sendStopBtn.title = 'Остановить';
  }

  // Lock/unlock UI during streaming
  function setStreamingUIState(isStreaming) {
    // Disable new conversation button
    newConversationBtn.disabled = isStreaming;
    if (isStreaming) {
      newConversationBtn.classList.add('disabled-during-streaming');
    } else {
      newConversationBtn.classList.remove('disabled-during-streaming');
    }

    // Disable conversation list items
    const conversationItems = document.querySelectorAll('.conversation-item');
    conversationItems.forEach(item => {
      if (isStreaming) {
        item.classList.add('disabled-during-streaming');
        item.style.pointerEvents = 'none';
        item.style.opacity = '0.5';
      } else {
        item.classList.remove('disabled-during-streaming');
        item.style.pointerEvents = '';
        item.style.opacity = '';
      }
    });
  }

  function formatTs(ts) {
    const d = ts ? new Date(ts) : new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
  }

  // Format number with k suffix (1300 -> 1.3k)
  function formatTokenCount(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  // Update total tokens display in footer
  function updateTokensDisplay() {
    const tokensEl = document.getElementById("total-tokens");
    if (tokensEl) {
      const total = totalInputTokens + totalOutputTokens;
      tokensEl.innerHTML = `
        <span class="token-arrow">↑</span> ${formatTokenCount(totalInputTokens)}
        <span class="token-arrow">↓</span> ${formatTokenCount(totalOutputTokens)}
        <span class="token-total">(${formatTokenCount(total)})</span>
      `;
    }
  }

  // Reset token counters
  function resetTokenCounters() {
    totalInputTokens = 0;
    totalOutputTokens = 0;
    updateTokensDisplay();
  }

  // Calculate total tokens from history
  function calculateTotalTokensFromHistory() {
    const history = loadHistory();
    let inputSum = 0;
    let outputSum = 0;

    for (const msg of history) {
      if (msg.tokens) {
        inputSum += msg.tokens.input_tokens || 0;
        outputSum += msg.tokens.output_tokens || 0;
      }
    }

    totalInputTokens = inputSum;
    totalOutputTokens = outputSum;
    updateTokensDisplay();
  }

  // Load history for current active conversation
  function loadHistory() {
    const activeConv = conversationsManager.getActive();
    if (!activeConv) return [];
    return conversationsManager.loadHistory(activeConv.id);
  }

  // Save history for current active conversation
  function saveHistory(arr) {
    const activeConv = conversationsManager.getActive();
    if (!activeConv) return;
    conversationsManager.saveHistory(activeConv.id, arr);
  }

  function saveMessageToHistory(msg) {
    const arr = loadHistory();
    arr.push(msg);
    if (arr.length > HISTORY_LIMIT) {
      arr.splice(0, arr.length - HISTORY_LIMIT);
    }
    saveHistory(arr);
  }

  function renderHistory() {
    const arr = loadHistory();
    chatEl.innerHTML = "";
    currentAssistantBubble = null;
    for (const m of arr) {
      appendMessage(m.role, m.text, false, m.ts, m.tokens, m.files, m.message_id, m.feedback_score);
    }
  }

  // Render conversations list in sidebar
  function renderConversationsList() {
    const conversations = conversationsManager.getAll();
    const activeConv = conversationsManager.getActive();

    conversationsList.innerHTML = "";

    if (conversations.length === 0) {
      conversationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Нет бесед</div>';
      return;
    }

    conversations.forEach(conv => {
      const item = document.createElement("div");
      item.className = "conversation-item";
      if (activeConv && conv.id === activeConv.id) {
        item.classList.add("active");
      }

      const title = document.createElement("h3");
      title.className = "conversation-title";
      title.textContent = conv.title;

      const meta = document.createElement("div");
      meta.className = "conversation-meta";

      const count = document.createElement("span");
      count.className = "conversation-count";
      count.innerHTML = `💬 ${conv.message_count}`;

      const time = document.createElement("span");
      time.className = "conversation-time";
      time.textContent = window.conversationsUtils.formatRelativeTime(conv.updated_at);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "conversation-delete";
      deleteBtn.innerHTML = "✕";
      deleteBtn.title = "Удалить беседу";

      meta.appendChild(count);
      meta.appendChild(time);

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(deleteBtn);

      // Click on conversation to switch
      item.addEventListener("click", (e) => {
        if (e.target === deleteBtn) return;
        switchToConversation(conv.id);
      });

      // Delete conversation
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Удалить беседу "${conv.title}"?`)) {
          conversationsManager.deleteConversation(conv.id);
          renderConversationsList();

          // If we deleted active conversation, switch to the new active one
          const newActive = conversationsManager.getActive();
          if (newActive) {
            switchToConversation(newActive.id);
          }
        }
      });

      conversationsList.appendChild(item);
    });
  }

  // Switch to a different conversation
  function switchToConversation(conversationId) {
    // Save current file viewer state before switching
    const currentConv = conversationsManager.getActive();
    if (currentConv && window.fileViewer) {
      const currentFileState = window.fileViewer.getCurrentState();
      conversationsManager.saveFileViewerState(currentConv.id, currentFileState);
    }

    if (!conversationsManager.setActive(conversationId)) {
      console.error("Failed to switch conversation");
      return;
    }

    const conv = conversationsManager.getById(conversationId);
    if (!conv) return;

    // Update API conversation_id
    convId = conv.conversation_id || "";
    setSession(convId);

    // Render history for this conversation
    renderHistory();

    // Recalculate tokens from history
    calculateTotalTokensFromHistory();

    // Restore file viewer state for this conversation
    if (window.fileViewer) {
      const fileViewerState = conversationsManager.loadFileViewerState(conversationId);
      window.fileViewer.restoreState(fileViewerState);
    }

    // Update sidebar
    renderConversationsList();

    // Close mobile sidebar if open
    sidebar.classList.remove("mobile-open");
    const overlay = document.querySelector(".sidebar-overlay");
    if (overlay) overlay.classList.remove("visible");

    setStatus("Готово");
  }

  function setStatus(text, showSpinner = false) {
    if (showSpinner) {
      statusEl.innerHTML = '<span class="spinner"></span>' + text;
    } else {
      statusEl.textContent = text;
    }
  }

  function setSession(id) {
    convId = id || "";
    sessionIdEl.textContent = convId || "—";
    if (convId) {
      localStorage.setItem("onec_conv_id", convId);
    } else {
      localStorage.removeItem("onec_conv_id");
    }
  }

  function appendMessage(role, text, append = false, ts = null, tokens = null, files = null, messageId = null, feedbackScore = null) {
    let bubbleWrap = null;
    let createdNow = false;

    if (append && currentAssistantBubble && role === "assistant") {
      bubbleWrap = currentAssistantBubble;
    } else {
      bubbleWrap = document.createElement("div");
      bubbleWrap.className = "msg " + role;

      // Add avatar
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      if (role === "user") {
        avatar.textContent = "👤";
      } else {
        const img = document.createElement("img");
        img.src = "/chat/static/buddy_small.png";
        img.alt = "assistant";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        avatar.appendChild(img);
      }

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      // Add copy button for assistant messages
      if (role === "assistant") {
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.title = "Копировать сообщение";
        copyBtn.innerHTML = "📋";
        copyBtn.addEventListener("click", () => {
          const rawText = bubbleWrap.dataset.raw || text || "";
          navigator.clipboard.writeText(rawText).then(() => {
            copyBtn.innerHTML = "✓";
            copyBtn.classList.add("copied");
            setTimeout(() => {
              copyBtn.innerHTML = "📋";
              copyBtn.classList.remove("copied");
            }, 2000);
          }).catch(() => {
            copyBtn.innerHTML = "✗";
            setTimeout(() => {
              copyBtn.innerHTML = "📋";
            }, 2000);
          });
        });
        bubble.appendChild(copyBtn);

        // Add feedback buttons for assistant messages
        const feedbackContainer = document.createElement("div");
        feedbackContainer.className = "feedback-buttons";

        const likeBtn = document.createElement("button");
        likeBtn.className = "feedback-btn like-btn";
        likeBtn.title = "Ответ помог";
        likeBtn.innerHTML = "👍";

        const dislikeBtn = document.createElement("button");
        dislikeBtn.className = "feedback-btn dislike-btn";
        dislikeBtn.title = "Ответ не помог";
        dislikeBtn.innerHTML = "👎";

        likeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const messageId = bubbleWrap.dataset.messageId;
          if (!messageId) {
            console.warn("Message ID not found for feedback");
            return;
          }
          await sendFeedback(messageId, 1, likeBtn, dislikeBtn, bubbleWrap);
        });

        dislikeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const messageId = bubbleWrap.dataset.messageId;
          if (!messageId) {
            console.warn("Message ID not found for feedback");
            return;
          }
          await sendFeedback(messageId, -1, likeBtn, dislikeBtn, bubbleWrap);
        });

        feedbackContainer.appendChild(likeBtn);
        feedbackContainer.appendChild(dislikeBtn);
        bubble.appendChild(feedbackContainer);

        // Add token info button for assistant messages
        const tokenBtn = document.createElement("button");
        tokenBtn.className = "token-btn";
        tokenBtn.title = "Информация о токенах";
        tokenBtn.innerHTML = "#";

        // Create tooltip for token info
        const tokenTooltip = document.createElement("div");
        tokenTooltip.className = "token-tooltip";

        tokenBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          tokenTooltip.classList.toggle("visible");
        });

        // Close tooltip when clicking outside
        document.addEventListener("click", (e) => {
          if (!tokenBtn.contains(e.target) && !tokenTooltip.contains(e.target)) {
            tokenTooltip.classList.remove("visible");
          }
        });

        bubble.appendChild(tokenBtn);
        bubble.appendChild(tokenTooltip);

        // If tokens data is provided (from history), restore it
        if (tokens) {
          bubbleWrap.dataset.inputTokens = tokens.input_tokens || 0;
          bubbleWrap.dataset.outputTokens = tokens.output_tokens || 0;
          bubbleWrap.dataset.totalTokens = tokens.total_tokens || 0;

          // Update tooltip content
          tokenTooltip.innerHTML = `
            <div class="token-row">
              <span class="token-label">Исходящие:</span>
              <span class="token-value">${tokens.input_tokens || 0}</span>
            </div>
            <div class="token-separator"></div>
            <div class="token-row">
              <span class="token-label">Входящие:</span>
              <span class="token-value">${tokens.output_tokens || 0}</span>
            </div>
            <div class="token-separator"></div>
            <div class="token-row">
              <span class="token-label">Всего:</span>
              <span class="token-value">${tokens.total_tokens || 0}</span>
            </div>
          `;
        }

        // Restore message_id if provided (from history)
        if (messageId) {
          bubbleWrap.dataset.messageId = messageId;
        }

        // Restore feedback state if provided (from history)
        if (feedbackScore !== null && feedbackScore !== undefined) {
          bubbleWrap.dataset.feedbackScore = feedbackScore;

          // Update button states to show which was clicked
          const feedbackButtons = bubble.querySelector(".feedback-buttons");
          if (feedbackButtons) {
            const likeBtn = feedbackButtons.querySelector(".like-btn");
            const dislikeBtn = feedbackButtons.querySelector(".dislike-btn");

            if (feedbackScore === 1) {
              likeBtn.classList.add("active");
              dislikeBtn.classList.remove("active");
            } else if (feedbackScore === -1) {
              dislikeBtn.classList.add("active");
              likeBtn.classList.remove("active");
            }
          }
        }
      }

      // Separate content/meta containers (meta holds timestamp)
      const content = document.createElement("div");
      content.className = "content";
      const meta = document.createElement("div");
      meta.className = "meta";

      bubble.appendChild(content);
      bubble.appendChild(meta);

      bubbleWrap.appendChild(avatar);
      bubbleWrap.appendChild(bubble);
      chatEl.appendChild(bubbleWrap);
      if (role === "assistant") currentAssistantBubble = bubbleWrap;
      createdNow = true;
    }

    const bubble = bubbleWrap.querySelector(".bubble");
    let content = bubble.querySelector(".content");
    if (!content) {
      content = document.createElement("div");
      content.className = "content";
      bubble.appendChild(content);
    }
    let meta = bubble.querySelector(".meta");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "meta";
      bubble.appendChild(meta);
    }

    if (role === "assistant") {
      // Accumulate raw assistant text and defensively de-duplicate possible "full text" chunks
      const prev = bubbleWrap.dataset.raw || "";
      let delta = text || "";

      if (append && delta) {
        // If upstream mistakenly sends full text instead of a pure delta, trim known prefix
        if (delta.startsWith(prev)) {
          delta = delta.slice(prev.length);
        } else if (prev && delta.length > 0) {
          // More aggressive overlap detection: find the longest suffix of prev that matches prefix of delta
          const maxOverlap = Math.min(prev.length, delta.length);
          let overlap = 0;

          // Start from maximum possible overlap and work down
          for (let i = maxOverlap; i > 0; i--) {
            const prevSuffix = prev.slice(-i);
            const deltaPrefix = delta.slice(0, i);
            if (prevSuffix === deltaPrefix) {
              overlap = i;
              break;
            }
          }

          if (overlap > 0) {
            delta = delta.slice(overlap);
          }
        }
      }

      const next = append ? prev + delta : (text || "");
      bubbleWrap.dataset.raw = next;

      if (window.Markdown && typeof window.Markdown.render === "function") {
        content.innerHTML = window.Markdown.render(next);
        // After markdown rendering, highlight BSL blocks and inline code
        if (window.BSL && typeof window.BSL.highlightAll === "function") {
          try {
            window.BSL.highlightAll(content, { autodetect: true, inline: true });
          } catch (e) {}
        }
        // Highlight XML blocks and inline code
        if (window.XML && typeof window.XML.highlightAll === "function") {
          try {
            window.XML.highlightAll(content, { autodetect: true, inline: true });
          } catch (e) {}
        }
        // Render Mermaid diagrams
        renderMermaidDiagrams(content);
      } else {
        content.textContent = next;
      }
    } else {
      // For user messages, render markdown with syntax highlighting
      const rawText = append ? (bubbleWrap.dataset.raw || "") + (text || "") : (text || "");
      bubbleWrap.dataset.raw = rawText;

      if (window.Markdown && typeof window.Markdown.render === "function") {
        content.innerHTML = window.Markdown.render(rawText);
        // After markdown rendering, highlight BSL blocks and inline code
        if (window.BSL && typeof window.BSL.highlightAll === "function") {
          try {
            window.BSL.highlightAll(content, { autodetect: true, inline: true });
          } catch (e) {}
        }
        // Highlight XML blocks and inline code
        if (window.XML && typeof window.XML.highlightAll === "function") {
          try {
            window.XML.highlightAll(content, { autodetect: true, inline: true });
          } catch (e) {}
        }
        // Render Mermaid diagrams
        renderMermaidDiagrams(content);
      } else {
        content.textContent = rawText;
      }
    }

    // Render attached files list for user messages
    if (role === "user" && files && files.length > 0 && createdNow) {
      const filesContainer = document.createElement("div");
      filesContainer.className = "message-attached-files";

      files.forEach(fileInfo => {
        const fileItem = document.createElement("div");
        fileItem.className = "message-file-item";

        const icon = document.createElement("span");
        icon.className = "message-file-icon";
        const fileName = fileInfo.name.toLowerCase();
        if (fileName.endsWith('.xml')) {
          icon.textContent = '🏷️';
        } else if (fileName.endsWith('.txt')) {
          icon.textContent = '📄';
        } else {
          icon.textContent = '📝';
        }

        const name = document.createElement("span");
        name.className = "message-file-name";
        name.textContent = fileInfo.name;

        const size = document.createElement("span");
        size.className = "message-file-size";
        size.textContent = formatFileSize(fileInfo.size);

        // View button
        const viewIcon = document.createElement("span");
        viewIcon.className = "message-file-view";
        viewIcon.textContent = "👁";
        viewIcon.title = "Просмотр";
        viewIcon.style.cursor = "pointer";

        if (fileInfo.content) {
          viewIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            if (window.fileViewer) {
              window.fileViewer.open({
                name: fileInfo.name,
                content: fileInfo.content,
                type: fileInfo.type || 'text/plain',
                size: fileInfo.size
              });
            }
          });
        }

        // Download button
        const downloadIcon = document.createElement("span");
        downloadIcon.className = "message-file-download";
        downloadIcon.textContent = "⬇";
        downloadIcon.title = "Скачать";
        downloadIcon.style.cursor = "pointer";

        if (fileInfo.content) {
          downloadIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            downloadFile(fileInfo.name, fileInfo.content, fileInfo.type);
          });
        }

        fileItem.appendChild(icon);
        fileItem.appendChild(name);
        fileItem.appendChild(size);
        if (fileInfo.content) {
          fileItem.appendChild(viewIcon);
          fileItem.appendChild(downloadIcon);
        }
        filesContainer.appendChild(fileItem);
      });

      bubble.appendChild(filesContainer);
    }

    // Set/update timestamp: on new bubble or on non-append writes
    if (createdNow || !append) {
      meta.textContent = formatTs(ts || Date.now());
    }

    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // Helper function to format file size
  function formatFileSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} байт`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} КБ`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    }
  }

  // Helper function to download file
  function downloadFile(fileName, content, mimeType = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Ошибка при скачивании файла');
    }
  }

  // Initialize UI state
  const activeConv = conversationsManager.getActive();
  if (activeConv) {
    convId = activeConv.conversation_id || "";
    setSession(convId);
  }
  setStatus("Готово");
  renderHistory();
  calculateTotalTokensFromHistory();
  renderConversationsList();

  // Restore file viewer state for active conversation after FileViewer is initialized
  function restoreInitialFileViewerState() {
    const activeConv = conversationsManager.getActive();
    if (activeConv && window.fileViewer) {
      const fileViewerState = conversationsManager.loadFileViewerState(activeConv.id);
      if (fileViewerState) {
        window.fileViewer.restoreState(fileViewerState);
      }
    }
  }

  // Try to restore immediately if FileViewer is already available
  if (window.fileViewer) {
    restoreInitialFileViewerState();
  } else {
    // Otherwise wait for DOMContentLoaded or use a short delay
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(restoreInitialFileViewerState, 100);
      });
    } else {
      setTimeout(restoreInitialFileViewerState, 100);
    }
  }

  // Make restore function available globally for FileViewer initialization
  window.restoreInitialFileViewerState = restoreInitialFileViewerState;

  // New conversation button
  newConversationBtn.addEventListener("click", () => {
    const newConv = conversationsManager.createConversation();
    switchToConversation(newConv.id);
    setStatus("Новая беседа создана");
  });

  // Clear current conversation history
  clearChatBtn.addEventListener("click", () => {
    const activeConv = conversationsManager.getActive();
    if (!activeConv) return;

    if (confirm("Очистить историю текущей беседы?")) {
      chatEl.innerHTML = "";
      currentAssistantBubble = null;
      conversationsManager.saveHistory(activeConv.id, []);

      // Reset API conversation_id
      activeConv.conversation_id = null;
      convId = "";
      setSession("");

      // Reset token counters
      resetTokenCounters();

      renderConversationsList();
      setStatus("История очищена");
    }
  });

  // Clear all conversations
  clearAllConversationsBtn.addEventListener("click", () => {
    const conversations = conversationsManager.getAll();
    if (conversations.length === 0) return;

    const confirmMsg = `Вы уверены, что хотите удалить все беседы (${conversations.length})?\n\nЭто действие нельзя отменить!`;
    if (confirm(confirmMsg)) {
      conversationsManager.clearAll();

      // Clear chat display
      chatEl.innerHTML = "";
      currentAssistantBubble = null;

      // Reset session
      const newActive = conversationsManager.getActive();
      if (newActive) {
        convId = newActive.conversation_id || "";
        setSession(convId);
      }

      renderHistory();
      resetTokenCounters();
      renderConversationsList();
      setStatus("Все беседы удалены");
    }
  });

  // Toggle sidebar (desktop) - кнопка внутри sidebar
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  // Desktop toggle button (в topbar, показывается когда sidebar свернут)
  desktopToggleBtn.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
  });

  // Mobile sidebar toggle
  mobileToggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");

    // Create overlay if it doesn't exist
    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      document.body.appendChild(overlay);

      overlay.addEventListener("click", () => {
        sidebar.classList.remove("mobile-open");
        overlay.classList.remove("visible");
      });
    }

    overlay.classList.toggle("visible");
  });

  // Send/Stop button handler
  sendStopBtn.addEventListener("click", (e) => {
    // If streaming, stop it
    if (streaming && currentEventSource) {
      e.preventDefault();
      currentEventSource.close();
      currentEventSource = null;
      streaming = false;
      setStreamingUIState(false);
      setSendMode();
      setStatus("Остановлено");
      currentAssistantBubble = null;
    }
    // Otherwise, form submit will handle sending
  });


  // Export history handler
  exportBtn.addEventListener("click", () => {
    const history = loadHistory();
    const exportData = {
      exported_at: new Date().toISOString(),
      conversation_id: convId,
      messages: history
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `1c-chat-history-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("История экспортирована");
    setTimeout(() => setStatus("Готово"), 2000);
  });

  // Search button handler
  searchBtn.addEventListener("click", () => {
    searchContainer.classList.toggle("visible");
    if (searchContainer.classList.contains("visible")) {
      searchInput.focus();
    } else {
      searchInput.value = "";
      searchResults.textContent = "";
      // Remove all highlights
      document.querySelectorAll(".msg .bubble .highlight").forEach(el => {
        el.outerHTML = el.textContent;
      });
    }
  });

  // Store original HTML to restore later
  const messageOriginalHTML = new Map();

  // Helper function to save original HTML
  function saveOriginalHTML() {
    const messages = chatEl.querySelectorAll(".msg");
    messages.forEach(msg => {
      const content = msg.querySelector(".bubble .content");
      if (content && !messageOriginalHTML.has(content)) {
        messageOriginalHTML.set(content, content.innerHTML);
      }
    });
  }

  // Helper function to remove all highlights and restore original HTML
  function removeAllHighlights() {
    messageOriginalHTML.forEach((originalHTML, contentEl) => {
      if (contentEl.isConnected) {
        contentEl.innerHTML = originalHTML;
      }
    });
  }

  closeSearchBtn.addEventListener("click", () => {
    searchContainer.classList.remove("visible");
    searchInput.value = "";
    searchResults.textContent = "";
    removeAllHighlights();
  });

  // Helper function to highlight text in HTML while preserving structure
  function highlightInHTML(html, query) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();

        if (lowerText.includes(lowerQuery)) {
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let index = lowerText.indexOf(lowerQuery);

          while (index !== -1) {
            if (index > lastIndex) {
              fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
            }

            const mark = document.createElement("span");
            mark.className = "highlight";
            mark.textContent = text.substring(index, index + query.length);
            fragment.appendChild(mark);

            lastIndex = index + query.length;
            index = lowerText.indexOf(lowerQuery, lastIndex);
          }

          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }

          node.parentNode.replaceChild(fragment, node);
          return true;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList && node.classList.contains("highlight")) {
          return false;
        }

        const children = Array.from(node.childNodes);
        let found = false;
        children.forEach(child => {
          if (processNode(child)) {
            found = true;
          }
        });
        return found;
      }
      return false;
    }

    processNode(tempDiv);
    return tempDiv.innerHTML;
  }

  // Search input handler
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    if (!query) {
      searchResults.textContent = "";
      removeAllHighlights();
      return;
    }

    // Save original HTML if not saved yet
    saveOriginalHTML();

    // Restore original HTML first
    removeAllHighlights();

    let matchCount = 0;
    const messages = chatEl.querySelectorAll(".msg");
    messages.forEach(msg => {
      const bubble = msg.querySelector(".bubble");
      const content = bubble.querySelector(".content");
      if (!content) return;

      // Check if content contains query (case-insensitive)
      if (content.textContent.toLowerCase().includes(query.toLowerCase())) {
        const originalHTML = messageOriginalHTML.get(content);
        if (originalHTML) {
          const highlightedHTML = highlightInHTML(originalHTML, query);
          content.innerHTML = highlightedHTML;
          matchCount++;
        }
      }
    });

    searchResults.textContent = matchCount > 0 ? `Найдено: ${matchCount}` : "Ничего не найдено";
  });


  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = (input.value || "").trim();

    // Check if we have at least a message or attached files
    const hasAttachedFiles = window.fileAttachmentManager && window.fileAttachmentManager.attachedFiles.length > 0;
    if (!message && !hasAttachedFiles) return;

    // Check if this is an automatic fix message that should be hidden
    const skipUserMessage = window.__skipUserMessage || false;
    window.__skipUserMessage = false; // Reset flag

    input.value = "";
    input.style.height = 'auto'; // Reset textarea height after sending

    // Save info about attached files including content
    let attachedFilesInfo = null;
    if (hasAttachedFiles) {
      attachedFilesInfo = window.fileAttachmentManager.attachedFiles.map(fileData => ({
        name: fileData.file.name,
        size: fileData.size,
        content: fileData.content,
        type: fileData.file.type || 'text/plain'
      }));
    }

    // Combine message with attached files content
    let fullMessage = message;
    if (hasAttachedFiles) {
      const filesContent = window.fileAttachmentManager.getAttachedFilesContent();
      fullMessage = message + filesContent;
    }

    const ts = Date.now();

    // Only show user message in chat if it's not an automatic fix
    if (!skipUserMessage) {
      appendMessage("user", message, false, ts, null, attachedFilesInfo);
      saveMessageToHistory({ role: "user", text: message, ts, convId, files: attachedFilesInfo });
    }

    // Clear attached files after sending
    if (hasAttachedFiles) {
      window.fileAttachmentManager.clearAttachedFiles();
    }

    // Update conversations list to reflect new message (only if message was shown)
    if (!skipUserMessage) {
      renderConversationsList();
    }

    setStatus("Отправка...", true);
    streaming = false;

    // Start a fresh assistant bubble for the next reply
    currentAssistantBubble = null;

    try {
      streaming = true;
      setStreamingUIState(true);
      setStopMode();
      await startStream(fullMessage);
    } catch (err) {
      console.error(err);
      appendMessage("assistant", "Ошибка: " + (err?.message || "unknown"));
      setStatus("Ошибка");
      setSendMode();
    } finally {
      if (!streaming) {
        setStreamingUIState(false);
        setSendMode();
      }
    }
  });

  async function sendFeedback(messageId, score, likeBtn, dislikeBtn, bubbleWrap) {
    try {
      const response = await fetch("/chat/api/feedback", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message_id: messageId, score: score})
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Failed to send feedback");
      }

      // Visual feedback - показываем какая кнопка активна
      if (score === 1) {
        likeBtn.classList.add("active");
        dislikeBtn.classList.remove("active");
      } else {
        dislikeBtn.classList.add("active");
        likeBtn.classList.remove("active");
      }

      // Save feedback score to bubble dataset and history
      bubbleWrap.dataset.feedbackScore = score;

      // Update history with feedback
      const history = loadHistory();
      const messageIndex = history.findIndex(msg => msg.message_id === messageId);
      if (messageIndex !== -1) {
        history[messageIndex].feedback_score = score;
        saveHistory(history);
      }

    } catch (error) {
      console.error("Feedback error:", error);
      alert("Ошибка отправки отзыва: " + error.message);
    }
  }

  async function startStream(message) {

    // Find last assistant message to get parent_uuid
    let parentUuid = null;
    const history = loadHistory();
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant" && history[i].message_id) {
        parentUuid = history[i].message_id;
        break;
      }
    }

    const requestBody = {
      message: message,
      conversation_id: convId || null,
      create_new_session: forceNewSession || !convId,
      programming_language: null,
      parent_uuid: parentUuid
    };
    forceNewSession = false;

    // Use fetch for POST SSE streaming
    const response = await fetch("/chat/api/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    setStatus("Стрим...", true);

    // Custom EventSource-like object to maintain compatibility
    const es = {
      handlers: {},
      addEventListener(event, handler) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
      },
      close() {
        reader.cancel();
      },
      emit(event, data) {
        const handlers = this.handlers[event] || [];
        handlers.forEach(h => h({ data }));
      }
    };

    currentEventSource = es;

    // Process SSE stream
    (async () => {
      try {
        let currentEvent = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) {
              // Empty line resets event type
              currentEvent = "message";
              continue;
            }

            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }

            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              es.emit(currentEvent, dataStr);
            }
          }
        }
      } catch (err) {
        if (es.handlers.onerror) {
          es.handlers.onerror(err);
        }
      }
    })();

    es.addEventListener("meta", (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.conversation_id) {
          convId = d.conversation_id;
          setSession(d.conversation_id);

          // Update conversation's API conversation_id
          const activeConv = conversationsManager.getActive();
          if (activeConv) {
            conversationsManager.updateApiConversationId(activeConv.id, d.conversation_id);
          }
        }
      } catch (_) {}
    });

    es.addEventListener("reset", () => {
      // Server detected upstream restart - remove old bubble and start fresh
      if (currentAssistantBubble) {
        // Remove the incomplete bubble from DOM
        currentAssistantBubble.remove();
        currentAssistantBubble = null;
      }
    });

    es.addEventListener("delta", (ev) => {
      try {
        const d = JSON.parse(ev.data);
        // Debug: enable with localStorage.setItem("onec_debug_stream", "1")
        if (localStorage.getItem("onec_debug_stream") === "1") {
          const t = String(d.text || "");
          console.debug("[SSE delta]", { len: t.length, head: t.slice(0, 80), tail: t.slice(-80) });
        }
        appendMessage("assistant", d.text || "", true);

        // Store message_id in current assistant bubble for feedback
        if (d.message_id && currentAssistantBubble) {
          currentAssistantBubble.dataset.messageId = d.message_id;
        }
      } catch (_) {}
    });

    es.addEventListener("tokens", (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (currentAssistantBubble) {
          // Store token info in bubble dataset
          currentAssistantBubble.dataset.inputTokens = d.input_tokens || 0;
          currentAssistantBubble.dataset.outputTokens = d.output_tokens || 0;
          currentAssistantBubble.dataset.totalTokens = d.total_tokens || 0;

          // Accumulate tokens for conversation total
          totalInputTokens += d.input_tokens || 0;
          totalOutputTokens += d.output_tokens || 0;
          updateTokensDisplay();

          // Update token tooltip content
          const bubble = currentAssistantBubble.querySelector(".bubble");
          const tokenTooltip = bubble ? bubble.querySelector(".token-tooltip") : null;
          if (tokenTooltip) {
            tokenTooltip.innerHTML = `
              <div class="token-row">
                <span class="token-label">Исходящие:</span>
                <span class="token-value">${d.input_tokens || 0}</span>
              </div>
              <div class="token-separator"></div>
              <div class="token-row">
                <span class="token-label">Входящие:</span>
                <span class="token-value">${d.output_tokens || 0}</span>
              </div>
              <div class="token-separator"></div>
              <div class="token-row">
                <span class="token-label">Всего:</span>
                <span class="token-value">${d.total_tokens || 0}</span>
              </div>
            `;
          }
        }
      } catch (e) {
        console.error("Token event parsing error:", e);
      }
    });

    es.addEventListener("done", () => {
      try {
        let finalText = "";
        if (currentAssistantBubble) {
          finalText = currentAssistantBubble.dataset.raw || "";
          const b = currentAssistantBubble.querySelector(".bubble");
          const meta = b ? b.querySelector(".meta") : null;
          const ts3 = Date.now();
          if (meta) meta.textContent = formatTs(ts3);

          // Get token info from dataset
          const tokens = {
            input_tokens: parseInt(currentAssistantBubble.dataset.inputTokens || 0),
            output_tokens: parseInt(currentAssistantBubble.dataset.outputTokens || 0),
            total_tokens: parseInt(currentAssistantBubble.dataset.totalTokens || 0)
          };

          // Get message_id and feedback_score from dataset
          const messageId = currentAssistantBubble.dataset.messageId;
          const feedbackScore = currentAssistantBubble.dataset.feedbackScore;

          saveMessageToHistory({
            role: "assistant",
            text: finalText,
            ts: ts3,
            convId,
            tokens: tokens,
            message_id: messageId,
            feedback_score: feedbackScore ? parseInt(feedbackScore) : undefined
          });

          // Update conversations list to reflect new message count and time
          renderConversationsList();
        }
      } catch {}
      es.close();
      currentEventSource = null;
      streaming = false;
      setStreamingUIState(false);
      setSendMode();
      setStatus("Готово");
      // Next assistant reply should start a fresh bubble
      currentAssistantBubble = null;
    });

    es.addEventListener("error", (ev) => {
      try {
        if (ev.data) {
          const d = JSON.parse(ev.data);
          if (d.message) appendMessage("assistant", "Ошибка: " + d.message);
        }
      } catch (_) {}
      es.close();
      currentEventSource = null;
      streaming = false;
      setStreamingUIState(false);
      setSendMode();
      setStatus("Ошибка");
    });

    es.onerror = () => {
      es.close();
      currentEventSource = null;
      streaming = false;
      setStreamingUIState(false);
      setSendMode();
      setStatus("Ошибка сети");
    };
  }
})();

// Code Format Menu - контекстное меню для форматирования кода
class CodeFormatMenu {
  constructor() {
    this.textarea = document.getElementById('message-input');
    this.menu = document.getElementById('format-menu');
    this.isMenuOpen = false;
    this.selectedText = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;

    this.init();
  }

  init() {
    // Показать меню при выделении текста
    this.textarea.addEventListener('mouseup', () => this.handleSelection());
    this.textarea.addEventListener('keyup', () => this.handleSelection());

    // Обработка вставки из буфера обмена
    this.textarea.addEventListener('paste', (e) => {
      // Получаем вставленный текст из буфера сразу
      const pastedText = e.clipboardData?.getData('text') || '';

      // Проверяем, что текст многострочный (содержит переносы строк)
      const isMultiline = /[\n\r]/.test(pastedText);

      if (pastedText.trim().length > 1 && isMultiline) {
        // Сохраняем позицию курсора ДО вставки
        const startBeforePaste = this.textarea.selectionStart;

        // Небольшая задержка, чтобы текст успел вставиться
        setTimeout(() => {
          // Вычисляем позицию вставленного текста
          const pasteStart = startBeforePaste;
          const pasteEnd = startBeforePaste + pastedText.length;

          // Выделяем вставленный текст
          this.textarea.setSelectionRange(pasteStart, pasteEnd);

          // Обновляем переменные выделения
          this.selectedText = pastedText;
          this.selectionStart = pasteStart;
          this.selectionEnd = pasteEnd;

          // Показываем меню
          this.showMenu();
        }, 10);
      }
    });

    // Обработка кликов по кнопкам форматирования
    this.menu.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const format = e.currentTarget.dataset.format;
        this.applyFormat(format);
      });
    });

    // Закрытие меню при клике вне его
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target) && e.target !== this.textarea) {
        this.hideMenu();
      }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isMenuOpen) {
        this.hideMenu();
      }
    });

    // Скрыть меню при начале нового выделения
    this.textarea.addEventListener('mousedown', () => {
      if (this.isMenuOpen) {
        this.hideMenu();
      }
    });

    // Горячие клавиши: Ctrl+Shift+1 для 1С, Ctrl+Shift+X для XML
    this.textarea.addEventListener('keydown', (e) => {
      // Ctrl+Shift+1 для 1С
      if (e.ctrlKey && e.shiftKey && e.key === '!') { // ! это Shift+1
        e.preventDefault();
        if (this.textarea.selectionStart !== this.textarea.selectionEnd) {
          this.selectedText = this.textarea.value.substring(
            this.textarea.selectionStart,
            this.textarea.selectionEnd
          );
          this.selectionStart = this.textarea.selectionStart;
          this.selectionEnd = this.textarea.selectionEnd;
          this.applyFormat('1c');
        }
      }
      // Ctrl+Shift+X для XML
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        if (this.textarea.selectionStart !== this.textarea.selectionEnd) {
          this.selectedText = this.textarea.value.substring(
            this.textarea.selectionStart,
            this.textarea.selectionEnd
          );
          this.selectionStart = this.textarea.selectionStart;
          this.selectionEnd = this.textarea.selectionEnd;
          this.applyFormat('xml');
        }
      }
    });
  }

  handleSelection() {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;

    // Проверяем, есть ли выделенный текст
    if (start !== end) {
      this.selectedText = this.textarea.value.substring(start, end);
      this.selectionStart = start;
      this.selectionEnd = end;

      // Показываем меню только если выделено больше 1 символа
      if (this.selectedText.trim().length > 1) {
        this.showMenu();
      }
    } else {
      this.hideMenu();
    }
  }

  showMenu() {
    // Позиционирование меню относительно textarea
    const textareaRect = this.textarea.getBoundingClientRect();

    // Позиция: в верхнем правом углу textarea
    this.menu.style.top = `${textareaRect.top}px`;
    this.menu.style.left = `${textareaRect.right - 150}px`; // 150px примерная ширина меню

    // Подсветить наиболее вероятный язык
    const detectedLang = this.detectLanguage(this.selectedText);
    this.menu.querySelectorAll('.format-btn').forEach(btn => {
      btn.classList.toggle('suggested', btn.dataset.format === detectedLang);
    });

    this.menu.classList.remove('hidden');
    this.isMenuOpen = true;
  }

  hideMenu() {
    this.menu.classList.add('hidden');
    this.isMenuOpen = false;
  }

  detectLanguage(code) {
    // Если есть ключевые слова 1С
    if (/\b(Функция|Процедура|КонецФункции|КонецПроцедуры|Если|Тогда|Для|Каждого|Из|Цикл|Function|Procedure|EndFunction|EndProcedure)\b/i.test(code)) {
      return '1c';
    }
    // Если XML
    if (/^\s*<\?xml|^\s*<[a-zA-Z][\w\-:]*[^>]*>/.test(code.trim())) {
      return 'xml';
    }
    return null;
  }

  applyFormat(lang) {
    // Получаем текущее значение textarea
    const text = this.textarea.value;

    // Формируем код с markdown-тегами
    const formattedCode = `\`\`\`${lang}\n${this.selectedText}\n\`\`\``;

    // Заменяем выделенный текст на отформатированный
    const newText =
      text.substring(0, this.selectionStart) +
      formattedCode +
      text.substring(this.selectionEnd);

    // Обновляем значение textarea
    this.textarea.value = newText;

    // Устанавливаем курсор после вставленного кода
    const newCursorPos = this.selectionStart + formattedCode.length;
    this.textarea.setSelectionRange(newCursorPos, newCursorPos);

    // Фокус обратно на textarea
    this.textarea.focus();

    // Скрываем меню
    this.hideMenu();

    // Показать уведомление
    this.showNotification(`Код оформлен как ${lang.toUpperCase()}`);
  }

  showNotification(message) {
    // Простое уведомление
    const notification = document.createElement('div');
    notification.className = 'format-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
}

// Инициализация CodeFormatMenu при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  window.codeFormatMenu = new CodeFormatMenu();
});

// File attachment manager
class FileAttachmentManager {
  constructor() {
    this.attachBtn = document.getElementById('attach-btn');
    this.fileInput = document.getElementById('file-input');
    this.attachedFilesContainer = document.getElementById('attached-files');
    this.attachedFiles = []; // Array to store {file: File, content: string, size: number}
    this.maxSizeKB = 500; // Default, will be loaded from config

    this.init();
  }

  async init() {
    // Load configuration from server
    await this.loadConfig();

    // Click attach button to open file picker
    this.attachBtn.addEventListener('click', () => {
      this.fileInput.click();
    });

    // Handle file selection
    this.fileInput.addEventListener('change', async (e) => {
      await this.handleFileSelection(e.target.files);
      // Clear input to allow selecting same file again
      e.target.value = '';
    });
  }

  async loadConfig() {
    try {
      const response = await fetch('/chat/api/config');
      if (response.ok) {
        const config = await response.json();
        this.maxSizeKB = config.max_attached_files_size_kb || 500;
      }
    } catch (error) {
      console.warn('Failed to load chat config, using defaults:', error);
    }
  }

  async handleFileSelection(files) {
    const validExtensions = ['.bsl', '.xml', '.txt'];
    let addedCount = 0;

    for (const file of files) {
      const fileName = file.name.toLowerCase();
      const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

      if (!hasValidExtension) {
        this.showNotification(`Файл "${file.name}" пропущен. Разрешены только .bsl, .xml и .txt файлы.`, 'error');
        continue;
      }

      // Check if file already attached
      if (this.attachedFiles.some(f => f.file.name === file.name)) {
        this.showNotification(`Файл "${file.name}" уже прикреплен.`, 'warning');
        continue;
      }

      try {
        const content = await this.readFileContent(file);
        const sizeKB = file.size / 1024;

        // Check if adding this file would exceed the limit
        const currentTotalSizeKB = this.getTotalSizeKB();
        if (currentTotalSizeKB + sizeKB > this.maxSizeKB) {
          this.showNotification(
            `Файл "${file.name}" (${this.formatSize(file.size)}) не может быть прикреплен. ` +
            `Превышен лимит: ${this.formatSize(this.maxSizeKB * 1024)}. ` +
            `Текущий размер: ${this.formatSize(currentTotalSizeKB * 1024)}.`,
            'error'
          );
          continue;
        }

        this.attachedFiles.push({ file, content, size: file.size });
        addedCount++;
      } catch (error) {
        this.showNotification(`Ошибка при чтении файла "${file.name}".`, 'error');
        console.error('File read error:', error);
      }
    }

    // Render all attached files once after processing all files
    if (addedCount > 0) {
      this.renderAttachedFiles();
      if (addedCount === 1) {
        this.showNotification(`Прикреплен 1 файл.`, 'success');
      } else {
        this.showNotification(`Прикреплено файлов: ${addedCount}.`, 'success');
      }
    }
  }

  readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'UTF-8');
    });
  }

  renderAttachedFiles() {
    if (this.attachedFiles.length === 0) {
      this.attachedFilesContainer.classList.remove('has-files');
      this.attachedFilesContainer.innerHTML = '';
      return;
    }

    this.attachedFilesContainer.classList.add('has-files');
    this.attachedFilesContainer.innerHTML = '';

    this.attachedFiles.forEach((fileData, index) => {
      const item = document.createElement('div');
      item.className = 'attached-file-item';

      const icon = document.createElement('span');
      icon.className = 'attached-file-icon';
      const fileName = fileData.file.name.toLowerCase();
      if (fileName.endsWith('.xml')) {
        icon.textContent = '🏷️';
      } else if (fileName.endsWith('.txt')) {
        icon.textContent = '📄';
      } else {
        icon.textContent = '📝';
      }

      const name = document.createElement('span');
      name.className = 'attached-file-name';
      name.textContent = fileData.file.name;
      name.title = fileData.file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'attached-file-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.title = 'Удалить файл';
      removeBtn.addEventListener('click', () => this.removeFile(index));

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(removeBtn);
      this.attachedFilesContainer.appendChild(item);
    });
  }

  removeFile(index) {
    const fileName = this.attachedFiles[index].file.name;
    this.attachedFiles.splice(index, 1);
    this.renderAttachedFiles();
    this.showNotification(`Файл "${fileName}" удален.`, 'info');
  }

  getAttachedFilesContent() {
    if (this.attachedFiles.length === 0) {
      return '';
    }

    let filesContent = '\n\n';

    for (const fileData of this.attachedFiles) {
      const fileName = fileData.file.name;
      const lowerFileName = fileName.toLowerCase();

      let extension;
      if (lowerFileName.endsWith('.xml')) {
        extension = 'xml';
      } else if (lowerFileName.endsWith('.txt')) {
        extension = 'text';
      } else {
        extension = '1c';
      }

      filesContent += `--- Прикрепленный файл: ${fileName} ---\n`;
      filesContent += `\`\`\`${extension}\n`;
      filesContent += fileData.content;
      filesContent += `\n\`\`\`\n\n`;
    }

    return filesContent;
  }

  clearAttachedFiles() {
    this.attachedFiles = [];
    this.renderAttachedFiles();
  }

  getTotalSizeKB() {
    return this.attachedFiles.reduce((sum, fileData) => sum + (fileData.size / 1024), 0);
  }

  formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} байт`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} КБ`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'format-notification';
    notification.textContent = message;

    // Set color based on type
    if (type === 'error') {
      notification.style.background = 'var(--err)';
    } else if (type === 'warning') {
      notification.style.background = 'var(--warn)';
    } else if (type === 'success') {
      notification.style.background = 'var(--ok)';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Keyboard shortcuts: Enter = send, Shift+Enter = newline
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("send-form");
  const input = document.getElementById("message-input");
  const sendStopBtn = document.getElementById("send-stop-btn");

  if (input && form && sendStopBtn) {
    // Auto-resize textarea as user types
    function autoResize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 300) + 'px';
    }

    input.addEventListener("input", autoResize);

    // Initial resize
    autoResize();

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendStopBtn.disabled) {
          // Triggers the existing submit handler
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }
        }
      }
    });
  }

  // Initialize file attachment manager
  window.fileAttachmentManager = new FileAttachmentManager();

  // Mermaid fullscreen modal handler
  let mermaidModal = null;
  let modalZoom = 1;

  function createMermaidModal() {
    if (mermaidModal) return mermaidModal;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'mermaid-fullscreen-modal';
    modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      z-index: 10000;
      overflow: auto;
    `;

    // Create content container with overflow
    const content = document.createElement('div');
    content.className = 'mermaid-fullscreen-content';
    content.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      padding: 60px 20px 20px;
      box-sizing: border-box;
      overflow: auto;
    `;

    // Create centering wrapper
    const centerWrapper = document.createElement('div');
    centerWrapper.className = 'mermaid-center-wrapper';
    centerWrapper.style.cssText = `
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create diagram wrapper that will expand based on scale
    const diagramWrapper = document.createElement('div');
    diagramWrapper.className = 'mermaid-fullscreen-wrapper';
    diagramWrapper.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // Create diagram container
    const diagramContainer = document.createElement('div');
    diagramContainer.className = 'mermaid-fullscreen-diagram';
    diagramContainer.style.cssText = `
      transform-origin: center center;
      transition: transform 0.2s ease;
    `;

    // Create controls bar
    const controls = document.createElement('div');
    controls.className = 'mermaid-fullscreen-controls';
    controls.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 8px;
      z-index: 10001;
    `;

    const buttonStyle = `
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
    `;

    // Zoom out button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Уменьшить (Ctrl + колесико вниз)';
    zoomOutBtn.style.cssText = buttonStyle;

    // Zoom in button
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Увеличить (Ctrl + колесико вверх)';
    zoomInBtn.style.cssText = buttonStyle;

    // Reset zoom button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '100%';
    resetBtn.title = 'Сбросить масштаб';
    resetBtn.style.cssText = buttonStyle;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.title = 'Закрыть (ESC)';
    closeBtn.style.cssText = buttonStyle;

    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(closeBtn);

    diagramWrapper.appendChild(diagramContainer);
    centerWrapper.appendChild(diagramWrapper);
    content.appendChild(centerWrapper);
    modal.appendChild(controls);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Store natural SVG dimensions
    let naturalSvgWidth = 0;
    let naturalSvgHeight = 0;

    // Event handlers
    function updateZoom(newZoom) {
      modalZoom = Math.max(0.1, Math.min(100, newZoom)); // 10% to 10000%
      diagramContainer.style.transform = `scale(${modalZoom})`;
      resetBtn.textContent = `${Math.round(modalZoom * 100)}%`;

      // Update wrapper and center wrapper sizes to account for scale
      if (naturalSvgWidth && naturalSvgHeight) {
        // Set wrapper to natural size (where transform will be applied)
        diagramWrapper.style.width = `${naturalSvgWidth}px`;
        diagramWrapper.style.height = `${naturalSvgHeight}px`;

        // Set centerWrapper min-size to scaled dimensions for proper scrolling
        const scaledWidth = naturalSvgWidth * modalZoom;
        const scaledHeight = naturalSvgHeight * modalZoom;
        centerWrapper.style.minWidth = `${scaledWidth}px`;
        centerWrapper.style.minHeight = `${scaledHeight}px`;
      }
    }

    zoomInBtn.addEventListener('click', () => updateZoom(modalZoom + 0.25));
    zoomOutBtn.addEventListener('click', () => updateZoom(modalZoom - 0.25));
    resetBtn.addEventListener('click', () => updateZoom(1));

    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      modalZoom = 1;
      updateZoom(1);
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target === content) {
        modal.style.display = 'none';
        modalZoom = 1;
        updateZoom(1);
      }
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
        modalZoom = 1;
        updateZoom(1);
      }
    });

    // Mouse wheel zoom with Ctrl
    diagramContainer.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        updateZoom(modalZoom + delta);
      }
    }, { passive: false });

    mermaidModal = {
      element: modal,
      diagramContainer,
      show: (svgContent) => {
        // Insert SVG first
        diagramContainer.innerHTML = svgContent;

        // Reset transform for accurate measurement
        diagramContainer.style.transform = 'scale(1)';

        // Show modal to measure sizes
        modal.style.display = 'flex';

        // Get SVG dimensions
        const svg = diagramContainer.querySelector('svg');
        if (svg) {
          // Force reflow to get accurate dimensions
          void svg.offsetWidth;

          // Get natural size of SVG (without any transform)
          const svgRect = svg.getBoundingClientRect();
          naturalSvgWidth = svgRect.width || 800;
          naturalSvgHeight = svgRect.height || 600;

          // Get available viewport space (account for padding and controls)
          const availableWidth = window.innerWidth * 0.90;  // 90% of viewport width
          const availableHeight = window.innerHeight * 0.85; // 85% of viewport height

          // Calculate scale to fit screen
          const scaleX = availableWidth / naturalSvgWidth;
          const scaleY = availableHeight / naturalSvgHeight;

          // Use the smaller scale to ensure it fits both dimensions
          const optimalScale = Math.min(scaleX, scaleY); // No max limit for initial scale
          const finalScale = Math.max(optimalScale, 1); // Minimum 1x

          modalZoom = finalScale;
          updateZoom(finalScale);
        } else {
          naturalSvgWidth = 0;
          naturalSvgHeight = 0;
          modalZoom = 1;
          updateZoom(1);
        }
      }
    };

    return mermaidModal;
  }

  // Listen for fullscreen event from markdown.js
  document.addEventListener('mermaid-fullscreen', (e) => {
    const modal = createMermaidModal();
    modal.show(e.detail.svg);
  });
});

// File Viewer Class - manages the right sidebar file viewer panel
class FileViewer {
  constructor() {
    this.panel = document.getElementById('file-viewer-panel');
    this.closeBtn = document.getElementById('close-file-viewer-btn');
    this.contentEl = document.getElementById('file-viewer-content');
    this.filenameEl = document.getElementById('file-viewer-filename');
    this.sizeEl = document.getElementById('file-viewer-size');
    this.copyBtn = document.getElementById('copy-file-content-btn');
    this.downloadBtn = document.getElementById('download-file-btn');
    this.collapseAllBtn = document.getElementById('collapse-all-btn');
    this.expandAllBtn = document.getElementById('expand-all-btn');

    // Search elements
    this.searchBtn = document.getElementById('search-file-btn');
    this.searchContainer = document.getElementById('file-search-container');
    this.searchInput = document.getElementById('file-search-input');
    this.searchResults = document.getElementById('file-search-results');
    this.searchSpinner = document.getElementById('file-search-spinner');
    this.searchPrevBtn = document.getElementById('file-search-prev-btn');
    this.searchNextBtn = document.getElementById('file-search-next-btn');
    this.closeSearchBtn = document.getElementById('close-file-search-btn');

    this.currentFile = null; // {name, content, type, size}
    this.overlay = null;
    this.codeFoldingManager = null; // NEW: Instance of CodeFoldingManager for BSL files

    // Search state
    this.searchMatches = []; // Array of match elements (fallback for DOM approach)
    this.searchRanges = []; // Array of Range objects (for CSS Highlight API)
    this.currentMatchIndex = -1;
    this.originalContent = ''; // Store original HTML content (after syntax highlighting, before folding)
    this.savedFoldingState = null; // Store folding state before search (for restoration on close)
    this.searchTimeout = null; // Timeout for async search execution
    this.usingHighlightAPI = false; // Flag to track which approach is being used

    this.init();
  }

  init() {
    // Close button handler
    this.closeBtn.addEventListener('click', () => {
      this.close();
    });

    // Copy button handler
    this.copyBtn.addEventListener('click', () => {
      this.copyContent();
    });

    // Download button handler
    this.downloadBtn.addEventListener('click', () => {
      this.downloadFile();
    });

    // Collapse all button handler
    this.collapseAllBtn.addEventListener('click', () => {
      if (this.codeFoldingManager) {
        this.codeFoldingManager.collapseAll();
      }
    });

    // Expand all button handler
    this.expandAllBtn.addEventListener('click', () => {
      if (this.codeFoldingManager) {
        this.codeFoldingManager.expandAll();
      }
    });

    // Create overlay for mobile
    this.createOverlay();

    // Close on overlay click (mobile)
    this.overlay.addEventListener('click', () => {
      this.close();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel.classList.contains('open')) {
        this.close();
      }
    });

    // Search button handler
    this.searchBtn.addEventListener('click', () => {
      this.toggleSearch();
    });

    // Close search button handler
    this.closeSearchBtn.addEventListener('click', () => {
      this.closeSearch();
    });

    // Search input handler with debounce
    let searchTimeout;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.performSearch();
      }, 300);
    });

    // Search input keyboard navigation
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.navigateToPrevious();
        } else {
          this.navigateToNext();
        }
      } else if (e.key === 'Escape') {
        this.closeSearch();
      }
    });

    // Navigation buttons
    this.searchPrevBtn.addEventListener('click', () => {
      this.navigateToPrevious();
    });

    this.searchNextBtn.addEventListener('click', () => {
      this.navigateToNext();
    });
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'file-viewer-overlay';
    document.body.appendChild(this.overlay);
  }

  open(fileData) {
    // fileData: {name, content, type, size}
    this.currentFile = fileData;

    // Update filename
    this.filenameEl.textContent = fileData.name;

    // Update size
    this.sizeEl.textContent = this.formatSize(fileData.size);

    // Render content with syntax highlighting
    this.renderContent(fileData);

    // Show panel
    this.panel.classList.add('open');
    this.overlay.classList.add('visible');

    // Enable buttons
    this.copyBtn.disabled = false;
    this.downloadBtn.disabled = false;

    // Save state to current conversation
    this.saveCurrentState();
  }

  close() {
    this.panel.classList.remove('open');
    this.overlay.classList.remove('visible');
    this.currentFile = null;

    // Close search if open
    this.closeSearch();

    // NEW: Cleanup code folding manager
    if (this.codeFoldingManager) {
      this.codeFoldingManager.cleanup();
      this.codeFoldingManager = null;
    }

    // Hide collapse/expand buttons
    this.collapseAllBtn.style.display = 'none';
    this.expandAllBtn.style.display = 'none';

    // Save closed state to current conversation
    this.saveCurrentState();
  }

  // Toggle search panel visibility
  toggleSearch() {
    if (this.searchContainer.classList.contains('visible')) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  // Open search panel
  openSearch() {
    if (!this.currentFile) return;

    // UPDATED: Save folding state when opening search (not just on first search)
    // This ensures state is preserved even if user closes search without searching
    if (!this.savedFoldingState) {
      this.savedFoldingState = this.codeFoldingManager?.getFoldingState() || null;
    }

    // Save original content if not saved yet
    if (!this.originalContent) {
      const pre = this.contentEl.querySelector('pre');
      if (pre) {
        this.originalContent = pre.innerHTML;
      }
    }

    this.searchContainer.classList.add('visible');
    this.searchInput.focus();
  }

  // Close search panel and clear highlights
  closeSearch() {
    // Cancel pending search if any
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    this.searchContainer.classList.remove('visible');
    this.searchInput.value = '';
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchRanges = [];
    this.currentMatchIndex = -1;
    this.searchSpinner.classList.remove('visible');
    this.updateSearchUI();

    // CRITICAL FIX: Restore original HTML BEFORE reapplying folding
    // This ensures DOM is clean (no leftover fold-body wrappers from collapseAll during search)
    if (this.originalContent) {
      const pre = this.contentEl.querySelector('pre');
      if (pre) {
        pre.innerHTML = this.originalContent;
      }
    }

    // UPDATED: Restore ORIGINAL folding state (before search was opened)
    this.reapplyCodeFolding(this.savedFoldingState);
    this.savedFoldingState = null;  // Clear saved state
  }

  // Clear all search highlights - CSS CUSTOM HIGHLIGHT API VERSION
  // NO DOM modifications when using modern API
  clearSearchHighlights() {
    if (this.usingHighlightAPI) {
      // MODERN APPROACH: Simply delete the highlights (NO DOM changes!)
      if (typeof CSS !== 'undefined' && CSS.highlights) {
        CSS.highlights.delete('search-results');
        CSS.highlights.delete('search-current');
      }
      this.searchRanges = [];
    } else {
      // FALLBACK: Remove highlight spans from DOM
      const highlights = this.contentEl.querySelectorAll('.search-highlight, .search-highlight-current');
      highlights.forEach(span => {
        // Replace highlight span with its text content
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
      });

      // Normalize text nodes to merge adjacent text nodes
      const pre = this.contentEl.querySelector('pre');
      if (pre) {
        pre.normalize();
      }

      this.searchMatches = [];
    }
  }

  // Perform search and highlight matches - OPTIMIZED VERSION
  // Key optimization: Don't recreate code folding on every search!
  performSearch() {
    const query = this.searchInput.value.trim();

    // Cancel previous search if still pending
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    // Clear previous highlights
    this.clearSearchHighlights();
    this.searchMatches = [];
    this.searchRanges = [];
    this.currentMatchIndex = -1;

    if (!query) {
      // If query is empty, just update UI
      this.updateSearchUI();
      this.searchSpinner.classList.remove('visible');
      return;
    }

    // Show spinner for visual feedback
    this.searchSpinner.classList.add('visible');
    this.searchResults.textContent = 'Поиск...';

    // Use setTimeout to allow spinner to render before heavy operation
    this.searchTimeout = setTimeout(() => {
      const startTime = performance.now();

      // Save ORIGINAL folding state before first search (for restoration on close)
      if (!this.savedFoldingState && this.codeFoldingManager) {
        this.savedFoldingState = this.codeFoldingManager.getFoldingState() || null;
        console.log('✓ Saved folding state before search');
      }

      const pre = this.contentEl.querySelector('pre');
      if (!pre) {
        this.searchSpinner.classList.remove('visible');
        return;
      }

      // Get the code element
      const code = pre.querySelector('code');
      if (!code) {
        this.searchSpinner.classList.remove('visible');
        return;
      }

      // Perform case-insensitive search
      this.highlightMatches(code, query);

      // OPTIMIZATION: Don't call reapplyCodeFolding() here!
      // The folding structure is already in place, we just need to expand blocks with matches
      // This saves HUGE amount of time (parsing, DOM creation, event listeners, etc.)

      // Automatically expand blocks that contain search matches
      this.expandBlocksWithMatches();

      // Update match count and navigate to first match
      if (this.usingHighlightAPI) {
        // Using CSS Highlight API - searchRanges already populated by highlightMatches()
        if (this.searchRanges && this.searchRanges.length > 0) {
          this.currentMatchIndex = 0;
          this.updateCurrentMatch();
        }
      } else {
        // Using DOM fallback - query for highlight elements
        this.searchMatches = Array.from(this.contentEl.querySelectorAll('.search-highlight'));
        if (this.searchMatches.length > 0) {
          this.currentMatchIndex = 0;
          this.updateCurrentMatch();
        }
      }

      // Hide spinner
      this.searchSpinner.classList.remove('visible');
      this.updateSearchUI();

      const endTime = performance.now();
      const matchCount = this.usingHighlightAPI ? (this.searchRanges ? this.searchRanges.length : 0) : this.searchMatches.length;
      console.log(`✓ performSearch: ${matchCount} matches found in ${(endTime - startTime).toFixed(2)}ms`);

      // Clear timeout reference
      this.searchTimeout = null;
    }, 10); // Small delay to allow UI update
  }

  // Highlight all matches in the code - CSS CUSTOM HIGHLIGHT API VERSION
  // Key improvements over DOM manipulation approach:
  // 1. NO DOM modifications - works with CSS Custom Highlight API
  // 2. No conflicts with code folding structure
  // 3. Better performance - browser handles rendering
  // 4. Fallback to DOM manipulation for older browsers
  highlightMatches(element, query) {
    const startTime = performance.now();
    const lowerQuery = query.toLowerCase();

    // Feature detection: Check if CSS Custom Highlight API is supported
    if (typeof CSS !== 'undefined' && CSS.highlights) {
      // MODERN APPROACH: Use CSS Custom Highlight API
      this.highlightMatchesWithAPI(element, query, lowerQuery);
    } else {
      // FALLBACK: Use DOM manipulation for older browsers
      console.warn('CSS Custom Highlight API not supported, using DOM fallback');
      this.highlightMatchesWithDOM(element, query, lowerQuery);
    }

    const endTime = performance.now();
    const matchCount = this.usingHighlightAPI
      ? (this.searchRanges ? this.searchRanges.length : 0)
      : (this.searchMatches ? this.searchMatches.length : 0);
    console.log(`✓ highlightMatches: ${matchCount} matches found in ${(endTime - startTime).toFixed(2)}ms`);
  }

  // Modern implementation using CSS Custom Highlight API
  highlightMatchesWithAPI(element, query, lowerQuery) {
    const ranges = [];

    // Walk through all text nodes to find matches
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip folding indicators and placeholders
          const parent = node.parentElement;
          if (parent && (
            parent.classList.contains('fold-indicator') ||
            parent.classList.contains('fold-placeholder')
          )) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent;
      const lowerText = text.toLowerCase();
      let index = lowerText.indexOf(lowerQuery);

      while (index !== -1) {
        // Create a Range for this match (NO DOM modification!)
        const range = new Range();
        range.setStart(node, index);
        range.setEnd(node, index + query.length);
        ranges.push(range);

        index = lowerText.indexOf(lowerQuery, index + 1);
      }
    }

    // Store ranges for navigation
    this.searchRanges = ranges;
    this.usingHighlightAPI = true;

    // Create and register the highlight
    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set('search-results', highlight);
    } else {
      // Clear if no matches
      CSS.highlights.delete('search-results');
    }
  }

  // Fallback implementation using DOM manipulation (old approach)
  highlightMatchesWithDOM(element, query, lowerQuery) {
    const replacements = []; // Array of {node, fragment}

    function collectNodesToHighlight(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const lowerText = text.toLowerCase();

        if (lowerText.includes(lowerQuery)) {
          const fragment = document.createDocumentFragment();
          let lastIndex = 0;
          let index = lowerText.indexOf(lowerQuery);

          while (index !== -1) {
            // Add text before match
            if (index > lastIndex) {
              fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
            }

            // Add highlighted match
            const mark = document.createElement('span');
            mark.className = 'search-highlight';
            mark.textContent = text.substring(index, index + query.length);
            fragment.appendChild(mark);

            lastIndex = index + query.length;
            index = lowerText.indexOf(lowerQuery, lastIndex);
          }

          // Add remaining text
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }

          // Store replacement info
          replacements.push({ node, fragment });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip already highlighted elements and folding controls
        if (node.classList && (node.classList.contains('search-highlight') ||
            node.classList.contains('search-highlight-current') ||
            node.classList.contains('fold-indicator') ||
            node.classList.contains('fold-placeholder'))) {
          return;
        }

        // Process child nodes
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) {
          collectNodesToHighlight(children[i]);
        }
      }
    }

    // Collect all text nodes that need highlighting
    collectNodesToHighlight(element);

    // Apply all replacements at once (triggers minimal reflows)
    replacements.forEach(({ node, fragment }) => {
      node.parentNode.replaceChild(fragment, node);
    });

    // For fallback, collect created highlight elements for navigation
    this.searchMatches = Array.from(element.querySelectorAll('.search-highlight'));
    this.searchRanges = null; // Not using ranges in fallback
    this.usingHighlightAPI = false;
  }

  // Navigate to next match
  navigateToNext() {
    const matchCount = this.usingHighlightAPI ? (this.searchRanges ? this.searchRanges.length : 0) : this.searchMatches.length;
    if (matchCount === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex + 1) % matchCount;
    this.updateCurrentMatch();
    this.updateSearchUI();
  }

  // Navigate to previous match
  navigateToPrevious() {
    const matchCount = this.usingHighlightAPI ? (this.searchRanges ? this.searchRanges.length : 0) : this.searchMatches.length;
    if (matchCount === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex - 1 + matchCount) % matchCount;
    this.updateCurrentMatch();
    this.updateSearchUI();
  }

  // Update current match highlighting
  updateCurrentMatch() {
    if (this.usingHighlightAPI) {
      // MODERN APPROACH: Update highlights using CSS Custom Highlight API
      const matchCount = this.searchRanges ? this.searchRanges.length : 0;

      if (this.currentMatchIndex >= 0 && this.currentMatchIndex < matchCount) {
        // Create highlight for all non-current matches
        const otherRanges = this.searchRanges.filter((_, index) => index !== this.currentMatchIndex);
        const currentRange = this.searchRanges[this.currentMatchIndex];

        // Update CSS highlights
        if (otherRanges.length > 0) {
          const allHighlight = new Highlight(...otherRanges);
          CSS.highlights.set('search-results', allHighlight);
        } else {
          CSS.highlights.delete('search-results');
        }

        // Set current match highlight
        const currentHighlight = new Highlight(currentRange);
        CSS.highlights.set('search-current', currentHighlight);

        // Expand block containing current match
        this.expandBlockContainingRange(currentRange);

        // Scroll to current match
        this.scrollToRange(currentRange);
      }
    } else {
      // FALLBACK: Update DOM-based highlights
      this.searchMatches.forEach(match => {
        match.classList.remove('search-highlight-current');
        match.classList.add('search-highlight');
      });

      if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.searchMatches.length) {
        const currentMatch = this.searchMatches[this.currentMatchIndex];
        currentMatch.classList.remove('search-highlight');
        currentMatch.classList.add('search-highlight-current');

        // Expand block containing current match if it's collapsed
        this.expandBlockContainingElement(currentMatch);

        // Scroll to current match
        this.scrollToCurrentMatch();
      }
    }
  }

  // Scroll to current match
  scrollToCurrentMatch() {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.searchMatches.length) return;

    const currentMatch = this.searchMatches[this.currentMatchIndex];
    const container = this.contentEl;

    // Calculate position to scroll
    const matchRect = currentMatch.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Scroll if match is not in view
    if (matchRect.top < containerRect.top || matchRect.bottom > containerRect.bottom) {
      currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Update search UI (result count and button states)
  // Works with both CSS Highlight API and DOM fallback
  updateSearchUI() {
    const count = this.usingHighlightAPI
      ? (this.searchRanges ? this.searchRanges.length : 0)
      : this.searchMatches.length;

    if (count === 0) {
      this.searchResults.textContent = this.searchInput.value.trim() ? 'Не найдено' : '';
      this.searchPrevBtn.disabled = true;
      this.searchNextBtn.disabled = true;
    } else {
      this.searchResults.textContent = `${this.currentMatchIndex + 1} из ${count}`;
      this.searchPrevBtn.disabled = false;
      this.searchNextBtn.disabled = false;
    }
  }

  // Get current state (for saving)
  getCurrentState() {
    try {
      if (!this.currentFile || !this.panel.classList.contains('open')) {
        return null;
      }
      
      const state = {
        name: this.currentFile.name,
        content: this.currentFile.content,
        type: this.currentFile.type,
        size: this.currentFile.size
      };

      // NEW: Include folding state for BSL files
      if (this.codeFoldingManager) {
        try {
          state.foldingState = this.codeFoldingManager.getFoldingState();
        } catch (foldingError) {
          console.error('Error getting folding state:', foldingError);
          // Continue without folding state
        }
      }

      return state;

    } catch (error) {
      console.error('Error getting current state:', error);
      return null;
    }
  }

  // Restore state (when switching conversations)
  restoreState(fileData) {
    if (fileData) {
      this.open(fileData);
    } else {
      this.close();
    }
  }

  // Save current state to active conversation
  saveCurrentState() {
    if (window.conversationsManager) {
      const activeConv = window.conversationsManager.getActive();
      if (activeConv) {
        const state = this.getCurrentState();
        window.conversationsManager.saveFileViewerState(activeConv.id, state);
      }
    }
  }

  renderContent(fileData) {
    const { name, content } = fileData;
    const lowerName = name.toLowerCase();

    // Clear content
    this.contentEl.innerHTML = '';

    // Reset search state
    this.originalContent = '';
    this.searchMatches = [];
    this.currentMatchIndex = -1;
    this.savedFoldingState = null;  // Clear saved folding state from previous file
    if (this.searchContainer.classList.contains('visible')) {
      this.searchInput.value = '';
      this.updateSearchUI();
    }

    // Create pre and code elements
    const pre = document.createElement('pre');
    const code = document.createElement('code');

    // Detect language
    let language = 'text';
    if (lowerName.endsWith('.bsl')) {
      language = '1c';
      code.className = 'lang-1c'; // Add class for highlighter
    } else if (lowerName.endsWith('.xml')) {
      language = 'xml';
      code.className = 'lang-xml'; // Add class for highlighter
    }

    // Normalize line endings (convert \r\n to \n, remove standalone \r)
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Set text content
    code.textContent = normalizedContent;
    pre.appendChild(code);
    this.contentEl.appendChild(pre);

    // Apply syntax highlighting
    if (language === '1c' && window.BSL && typeof window.BSL.highlightAll === 'function') {
      try {
        window.BSL.highlightAll(this.contentEl, { autodetect: false, inline: false });
      } catch (e) {
        console.error('BSL highlighting error:', e);
      }
    } else if (language === 'xml' && window.XML && typeof window.XML.highlightAll === 'function') {
      try {
        window.XML.highlightAll(this.contentEl, { autodetect: false, inline: false });
      } catch (e) {
        console.error('XML highlighting error:', e);
      }
    }

    // UPDATED: Save originalContent AFTER syntax highlighting, but BEFORE folding
    // This ensures search can restore clean highlighted HTML without folding elements
    this.originalContent = pre.innerHTML;

    // NEW: Apply code folding for BSL files
    if (language === '1c') {
      this.applyCodeFolding();
    }
  }

  /**
   * NEW: Applies code folding functionality to BSL files
   * Creates CodeFoldingManager instance, parses procedures/functions,
   * injects fold indicators, and restores saved folding state
   */
  applyCodeFolding() {
    // Check if CodeFoldingManager is available
    if (typeof CodeFoldingManager === 'undefined') {
      console.warn('CodeFoldingManager is not available');
      return;
    }

    try {
      // Cleanup previous instance if exists
      if (this.codeFoldingManager) {
        this.codeFoldingManager.cleanup();
      }

      // Create new instance
      this.codeFoldingManager = new CodeFoldingManager(this.contentEl);

      // Parse procedures and functions
      const blocks = this.codeFoldingManager.parseProceduresAndFunctions();
      
      if (blocks.length === 0) {
        // No foldable blocks found, cleanup and return
        this.codeFoldingManager = null;
        return;
      }

      // Inject fold indicators into DOM
      this.codeFoldingManager.injectFoldIndicators();

      // Attach event listeners for fold indicators
      this.codeFoldingManager.attachFoldEventListeners();

      // Show collapse/expand buttons
      this.collapseAllBtn.style.display = '';
      this.expandAllBtn.style.display = '';

      // Restore folding state if exists
      const savedState = this.loadFoldingStateForCurrentFile();
      if (savedState) {
        this.codeFoldingManager.restoreFoldingState(savedState);
      }

    } catch (error) {
      console.error('Error applying code folding:', error);
      // Cleanup on error
      if (this.codeFoldingManager) {
        this.codeFoldingManager.cleanup();
        this.codeFoldingManager = null;
      }
    }
  }

  /**
   * Re-applies code folding after search operations
   * Preserves the folding state by accepting it as a parameter
   * This method is called when search modifies the DOM and folding needs to be recreated
   * @param {Object|null} foldingState - Saved folding state to restore
   */
  reapplyCodeFolding(foldingState) {
    // Check if we have a folding manager and if it's a BSL file
    if (!this.currentFile || !this.currentFile.name.toLowerCase().endsWith('.bsl')) {
      return;
    }

    // Check if CodeFoldingManager is available
    if (typeof CodeFoldingManager === 'undefined') {
      console.warn('CodeFoldingManager is not available');
      return;
    }

    try {
      // Cleanup previous instance if exists
      if (this.codeFoldingManager) {
        this.codeFoldingManager.cleanup();
        this.codeFoldingManager = null;
      }

      // Create new instance
      this.codeFoldingManager = new CodeFoldingManager(this.contentEl);

      // Parse procedures and functions
      const blocks = this.codeFoldingManager.parseProceduresAndFunctions();

      if (blocks.length === 0) {
        // No foldable blocks found, cleanup and return
        this.codeFoldingManager = null;
        this.collapseAllBtn.style.display = 'none';
        this.expandAllBtn.style.display = 'none';
        return;
      }

      // Inject fold indicators into DOM
      this.codeFoldingManager.injectFoldIndicators();

      // Attach event listeners for fold indicators
      this.codeFoldingManager.attachFoldEventListeners();

      // Show collapse/expand buttons
      this.collapseAllBtn.style.display = '';
      this.expandAllBtn.style.display = '';

      // Restore folding state
      // Priority: 1) Provided state parameter, 2) Saved state from localStorage
      if (foldingState && Object.keys(foldingState).length > 0) {
        this.codeFoldingManager.restoreFoldingState(foldingState);
      } else {
        const savedState = this.loadFoldingStateForCurrentFile();
        if (savedState) {
          this.codeFoldingManager.restoreFoldingState(savedState);
        }
      }

    } catch (error) {
      console.error('Error reapplying code folding:', error);
      // Cleanup on error
      if (this.codeFoldingManager) {
        this.codeFoldingManager.cleanup();
        this.codeFoldingManager = null;
      }
    }
  }

  /**
   * NEW: Loads folding state for the current file from the active conversation
   * @returns {Object|null} Folding state object or null if not found
   */
  loadFoldingStateForCurrentFile() {
    try {
      if (!this.currentFile) {
        return null;
      }

      // Get active conversation
      const activeConv = window.conversationsManager?.getActive();
      if (!activeConv) {
        return null;
      }

      // Load file viewer state for this conversation
      const fileViewerState = window.conversationsManager.loadFileViewerState(activeConv.id);
      if (!fileViewerState || fileViewerState.name !== this.currentFile.name) {
        return null;
      }

      // Return folding state if it exists
      return fileViewerState.foldingState || null;

    } catch (error) {
      console.error('Error loading folding state for current file:', error);
      return null;
    }
  }

  /**
   * Automatically expands blocks that contain search matches
   * Works with both CSS Highlight API and DOM fallback
   */
  expandBlocksWithMatches() {
    if (!this.codeFoldingManager || !this.codeFoldingManager.foldableBlocks) {
      return;
    }

    try {
      const startTime = performance.now();
      const pre = this.contentEl.querySelector('pre');
      if (!pre) return;

      const code = pre.querySelector('code');
      if (!code || !code.textContent) return;

      let highlightLines = new Set();

      if (this.usingHighlightAPI) {
        // MODERN APPROACH: Calculate line numbers from Range objects
        if (!this.searchRanges || this.searchRanges.length === 0) return;

        this.searchRanges.forEach(range => {
          const lineNumber = this.getLineNumberFromRange(code, range);
          if (lineNumber !== -1) {
            highlightLines.add(lineNumber);
          }
        });

      } else {
        // FALLBACK: Calculate line numbers from DOM elements
        const allHighlights = code.querySelectorAll('.search-highlight, .search-highlight-current');
        if (allHighlights.length === 0) return;

        // Get positions for all highlights in ONE TreeWalker pass
        const highlightPositions = new Map();
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
        let charPos = 0;
        let node;

        while (node = walker.nextNode()) {
          // Check if this node is a highlight element
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.classList.contains('search-highlight') ||
               node.classList.contains('search-highlight-current'))) {
            highlightPositions.set(node, charPos);
          }
          // Add text length
          if (node.nodeType === Node.TEXT_NODE) {
            charPos += node.textContent.length;
          }
        }

        // Calculate line numbers for highlights
        const lines = code.textContent.split('\n');
        let lineCharCount = 0;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const lineStartPos = lineCharCount;
          const lineEndPos = lineCharCount + lines[lineNum].length;

          // Check if any highlight positions fall on this line
          for (const [, pos] of highlightPositions) {
            if (pos >= lineStartPos && pos < lineEndPos) {
              highlightLines.add(lineNum);
            }
          }

          lineCharCount += lines[lineNum].length + 1; // +1 for \n
        }
      }

      // Batch expand operations (same for both approaches)
      let expandedCount = 0;
      this.codeFoldingManager.foldableBlocks.forEach(block => {
        if (!block.collapsed) return;

        // Check if block contains any highlight lines
        const hasMatches = Array.from(highlightLines).some(lineNum =>
          lineNum >= block.startLine && lineNum <= block.endLine
        );

        if (hasMatches) {
          this.codeFoldingManager.expandBlock(block.startLine);
          expandedCount++;
        }
      });

      const endTime = performance.now();
      if (expandedCount > 0) {
        console.log(`✓ Auto-expanded ${expandedCount} blocks in ${(endTime - startTime).toFixed(2)}ms`);
      }

    } catch (error) {
      console.error('Error expanding blocks with matches:', error);
    }
  }

  /**
   * Checks if a block contains search highlight elements
   * @param {Object} _block - Block to check (unused, kept for API consistency)
   * @param {number} startLine - Start line of block
   * @param {number} endLine - End line of block
   * @returns {boolean} true if block contains matches
   */
  blockContainsSearchMatches(_block, startLine, endLine) {
    try {
      const pre = this.contentEl.querySelector('pre');
      if (!pre) return false;

      const code = pre.querySelector('code');
      if (!code) return false;

      // Get all search highlight elements
      const allHighlights = Array.from(code.querySelectorAll('.search-highlight, .search-highlight-current'));

      if (allHighlights.length === 0) {
        return false;
      }

      // For each match, determine which line it's on
      const lines = code.textContent.split('\n');
      let charCount = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const lineStartPos = charCount;
        const lineEndPos = charCount + lines[lineNum].length;

        // Check if any matches are on this line
        for (const highlight of allHighlights) {
          // Find position of element in text
          const highlightPos = this.getElementCharPosition(code, highlight);

          if (highlightPos >= lineStartPos && highlightPos < lineEndPos) {
            // Match found on this line
            if (lineNum >= startLine && lineNum <= endLine) {
              return true;  // Match inside block
            }
          }
        }

        charCount += lines[lineNum].length + 1; // +1 for \n
      }

      return false;

    } catch (error) {
      console.error('Error checking block for matches:', error);
      return false;
    }
  }

  /**
   * Determines character position for a given DOM element in text
   * @param {HTMLElement} container - Container with text
   * @param {HTMLElement} element - Element to find
   * @returns {number} Character position or -1 if not found
   */
  getElementCharPosition(container, element) {
    try {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      let charPos = 0;
      let node;

      while (node = walker.nextNode()) {
        if (node === element) {
          return charPos;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          charPos += node.textContent.length;
        }
      }

      return -1;

    } catch (error) {
      console.error('Error getting element char position:', error);
      return -1;
    }
  }

  /**
   * Expands a block containing the specified element (if block is collapsed)
   * Used during search navigation to ensure current match is visible (DOM fallback)
   * @param {HTMLElement} element - Element inside block
   */
  expandBlockContainingElement(element) {
    if (!this.codeFoldingManager || !element) {
      return;
    }

    try {
      // Check if element is inside a collapsed block
      let currentNode = element;

      while (currentNode && currentNode !== this.contentEl) {
        // Check if current node is fold-body
        if (currentNode.classList && currentNode.classList.contains('fold-body')) {
          // Find line number of this block
          const startLine = parseInt(currentNode.getAttribute('data-start'), 10);

          if (!isNaN(startLine)) {
            // Find block by line number
            const block = this.codeFoldingManager.foldableBlocks.find(
              b => b.startLine === startLine ||
                   (b.startLine <= startLine && b.endLine >= startLine)
            );

            if (block && block.collapsed) {
              console.log(`Auto-expanding block at line ${block.startLine} to show search match`);
              this.codeFoldingManager.expandBlock(block.startLine);
            }
          }

          break;
        }

        currentNode = currentNode.parentNode;
      }

    } catch (error) {
      console.error('Error expanding block containing element:', error);
    }
  }

  /**
   * Expands a block containing the specified range (if block is collapsed)
   * Used during search navigation with CSS Highlight API
   * @param {Range} range - Range object to check
   */
  expandBlockContainingRange(range) {
    if (!this.codeFoldingManager || !range) {
      return;
    }

    try {
      const pre = this.contentEl.querySelector('pre');
      if (!pre) return;

      const code = pre.querySelector('code');
      if (!code) return;

      // Get the line number for this range
      const lineNumber = this.getLineNumberFromRange(code, range);
      if (lineNumber === -1) return;

      // Check if this line is inside a collapsed block
      const block = this.codeFoldingManager.foldableBlocks.find(
        b => b.collapsed && lineNumber >= b.startLine && lineNumber <= b.endLine
      );

      if (block) {
        console.log(`Auto-expanding block at line ${block.startLine} to show search match`);
        this.codeFoldingManager.expandBlock(block.startLine);
      }

    } catch (error) {
      console.error('Error expanding block containing range:', error);
    }
  }

  /**
   * Scrolls to a Range object (for CSS Highlight API)
   * @param {Range} range - Range to scroll to
   */
  scrollToRange(range) {
    if (!range) return;

    try {
      // Get bounding rectangles for the range
      const rects = range.getClientRects();
      if (rects.length === 0) return;

      // Use the first rect (in case of multi-line matches)
      const rect = rects[0];
      const container = this.contentEl;

      // Calculate position to scroll
      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;
      const offset = rect.top - containerRect.top + scrollTop;

      // Scroll to position (centered vertically)
      container.scrollTo({
        top: offset - container.clientHeight / 2 + rect.height / 2,
        behavior: 'smooth'
      });

    } catch (error) {
      console.error('Error scrolling to range:', error);
    }
  }

  /**
   * Gets the line number for a given Range in the code element
   * @param {HTMLElement} code - Code element
   * @param {Range} range - Range to find line number for
   * @returns {number} Line number (0-indexed) or -1 if not found
   */
  getLineNumberFromRange(code, range) {
    try {
      if (!code || !range) return -1;

      // Get the start container and offset
      const startContainer = range.startContainer;

      // Calculate character position of range start
      let charPosition = 0;
      const walker = document.createTreeWalker(
        code,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      let found = false;
      while (node = walker.nextNode()) {
        if (node === startContainer) {
          charPosition += range.startOffset;
          found = true;
          break;
        }
        charPosition += node.textContent.length;
      }

      if (!found) return -1;

      // Convert character position to line number
      const text = code.textContent;
      const lines = text.split('\n');
      let currentPos = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const lineEndPos = currentPos + lines[lineNum].length;
        if (charPosition >= currentPos && charPosition <= lineEndPos) {
          return lineNum;
        }
        currentPos = lineEndPos + 1; // +1 for newline
      }

      return -1;

    } catch (error) {
      console.error('Error getting line number from range:', error);
      return -1;
    }
  }

  copyContent() {
    if (!this.currentFile) return;

    navigator.clipboard.writeText(this.currentFile.content).then(() => {
      // Visual feedback
      const originalText = this.copyBtn.textContent;
      this.copyBtn.textContent = '✓ Скопировано';
      this.copyBtn.style.background = 'rgba(40, 167, 69, 0.2)';
      this.copyBtn.style.borderColor = 'rgba(40, 167, 69, 0.4)';

      setTimeout(() => {
        this.copyBtn.textContent = originalText;
        this.copyBtn.style.background = '';
        this.copyBtn.style.borderColor = '';
      }, 2000);
    }).catch((error) => {
      console.error('Copy error:', error);
      alert('Ошибка копирования в буфер обмена');
    });
  }

  downloadFile() {
    if (!this.currentFile) return;

    try {
      const blob = new Blob([this.currentFile.content], { type: this.currentFile.type || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.currentFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Ошибка при скачивании файла');
    }
  }

  formatSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} байт`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} КБ`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    }
  }
}

// Initialize File Viewer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.fileViewer = new FileViewer();
  });
} else {
  window.fileViewer = new FileViewer();
}