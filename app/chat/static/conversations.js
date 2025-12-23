/**
 * Conversations Manager - manages multiple chat conversations with isolated contexts
 */
(() => {
  const CONVERSATIONS_KEY = "onec_conversations_list";
  const ACTIVE_CONV_KEY = "onec_active_conversation";

  // Generate unique ID for conversations
  function generateId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Generate conversation title from first user message
  function generateTitle(firstMessage) {
    if (!firstMessage) return "Новая беседа";
    const cleaned = firstMessage.trim();
    if (cleaned.length <= 50) return cleaned;
    return cleaned.substring(0, 47) + "...";
  }

  // Format relative time (e.g., "5 мин назад", "Вчера")
  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "Только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days === 1) return "Вчера";
    if (days < 7) return `${days} дн назад`;

    const date = new Date(timestamp);
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }

  class ConversationsManager {
    constructor() {
      this.conversations = this.loadConversations();
      this.activeId = localStorage.getItem(ACTIVE_CONV_KEY);

      // If no conversations exist, create a default one
      if (this.conversations.length === 0) {
        const defaultConv = this.createConversation();
        this.activeId = defaultConv.id;
      }

      // If active conversation doesn't exist, set to first one
      if (!this.activeId || !this.conversations.find(c => c.id === this.activeId)) {
        this.activeId = this.conversations[0]?.id || null;
      }
    }

    // Load all conversations from localStorage
    loadConversations() {
      try {
        const data = localStorage.getItem(CONVERSATIONS_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("Failed to load conversations:", e);
        return [];
      }
    }

    // Save conversations to localStorage
    saveConversations() {
      try {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(this.conversations));
      } catch (e) {
        console.error("Failed to save conversations:", e);
      }
    }

    // Get history key for a specific conversation
    getHistoryKey(conversationId) {
      return `onec_conversation_history_${conversationId}`;
    }

    // Load history for a specific conversation
    loadHistory(conversationId) {
      try {
        const key = this.getHistoryKey(conversationId);
        const data = localStorage.getItem(key);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("Failed to load history:", e);
        return [];
      }
    }

    // Save history for a specific conversation
    saveHistory(conversationId, history) {
      try {
        const key = this.getHistoryKey(conversationId);
        localStorage.setItem(key, JSON.stringify(history));

        // Update conversation metadata
        const conv = this.conversations.find(c => c.id === conversationId);
        if (conv) {
          conv.updated_at = Date.now();
          conv.message_count = history.length;

          // Update title from first user message if title is default
          if (conv.title === "Новая беседа" && history.length > 0) {
            const firstUserMsg = history.find(m => m.role === "user");
            if (firstUserMsg) {
              conv.title = generateTitle(firstUserMsg.text);
            }
          }

          this.saveConversations();
        }
      } catch (e) {
        console.error("Failed to save history:", e);
      }
    }

    // Create a new conversation
    createConversation(title = "Новая беседа") {
      const conv = {
        id: generateId(),
        title: title,
        created_at: Date.now(),
        updated_at: Date.now(),
        message_count: 0,
        conversation_id: null  // Will be set when first message is sent to API
      };

      this.conversations.unshift(conv); // Add to beginning
      this.saveConversations();
      return conv;
    }

    // Delete a conversation
    deleteConversation(conversationId) {
      const index = this.conversations.findIndex(c => c.id === conversationId);
      if (index === -1) return false;

      // Remove from list
      this.conversations.splice(index, 1);
      this.saveConversations();

      // Remove history and file viewer state
      try {
        localStorage.removeItem(this.getHistoryKey(conversationId));
        localStorage.removeItem(this.getFileViewerStateKey(conversationId));
      } catch (e) {
        console.error("Failed to delete conversation data:", e);
      }

      // If we deleted the active conversation, switch to another one
      if (this.activeId === conversationId) {
        this.activeId = this.conversations[0]?.id || null;
        if (this.activeId) {
          localStorage.setItem(ACTIVE_CONV_KEY, this.activeId);
        } else {
          localStorage.removeItem(ACTIVE_CONV_KEY);
          // Create a new default conversation
          const newConv = this.createConversation();
          this.activeId = newConv.id;
        }
      }

      return true;
    }

    // Set active conversation
    setActive(conversationId) {
      const conv = this.conversations.find(c => c.id === conversationId);
      if (!conv) return false;

      this.activeId = conversationId;
      localStorage.setItem(ACTIVE_CONV_KEY, conversationId);
      return true;
    }

    // Get active conversation
    getActive() {
      return this.conversations.find(c => c.id === this.activeId);
    }

    // Get all conversations sorted by updated_at
    getAll() {
      return [...this.conversations].sort((a, b) => b.updated_at - a.updated_at);
    }

    // Update conversation's API conversation_id (from backend)
    updateApiConversationId(localId, apiConversationId) {
      const conv = this.conversations.find(c => c.id === localId);
      if (conv) {
        conv.conversation_id = apiConversationId;
        this.saveConversations();
      }
    }

    // Rename conversation
    renameConversation(conversationId, newTitle) {
      const conv = this.conversations.find(c => c.id === conversationId);
      if (conv) {
        conv.title = newTitle.trim() || "Новая беседа";
        this.saveConversations();
        return true;
      }
      return false;
    }

    // Get conversation by ID
    getById(conversationId) {
      return this.conversations.find(c => c.id === conversationId);
    }

    // Get file viewer state key for a specific conversation
    getFileViewerStateKey(conversationId) {
      return `onec_conversation_fileviewer_${conversationId}`;
    }

    // Save file viewer state for a specific conversation
    saveFileViewerState(conversationId, fileData) {
      try {
        const key = this.getFileViewerStateKey(conversationId);
        if (fileData) {
          localStorage.setItem(key, JSON.stringify(fileData));
        } else {
          localStorage.removeItem(key);
        }
      } catch (e) {
        console.error("Failed to save file viewer state:", e);
      }
    }

    // Load file viewer state for a specific conversation
    loadFileViewerState(conversationId) {
      try {
        const key = this.getFileViewerStateKey(conversationId);
        const data = localStorage.getItem(key);
        if (!data) return null;
        return JSON.parse(data);
      } catch (e) {
        console.error("Failed to load file viewer state:", e);
        return null;
      }
    }

    // Clear all conversations (for debugging)
    clearAll() {
      this.conversations.forEach(conv => {
        try {
          localStorage.removeItem(this.getHistoryKey(conv.id));
          localStorage.removeItem(this.getFileViewerStateKey(conv.id));
        } catch (e) {
          console.error("Failed to delete conversation data:", e);
        }
      });
      this.conversations = [];
      this.saveConversations();
      localStorage.removeItem(ACTIVE_CONV_KEY);

      // Create a new default conversation
      const newConv = this.createConversation();
      this.activeId = newConv.id;
    }
  }

  // Export to global scope
  window.ConversationsManager = ConversationsManager;
  window.conversationsUtils = {
    formatRelativeTime,
    generateTitle,
    generateId
  };
})();
