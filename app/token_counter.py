"""Token counting utilities using tiktoken."""

import logging
from typing import Optional

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False

logger = logging.getLogger(__name__)


class TokenCounter:
    """Count tokens in text using tiktoken (GPT-3.5/GPT-4 encoding)."""

    def __init__(self, encoding_name: str = "cl100k_base"):
        """
        Initialize token counter.

        Args:
            encoding_name: Tiktoken encoding name. Default is cl100k_base (GPT-3.5/GPT-4).
        """
        self.encoding_name = encoding_name
        self._encoder = None

        if TIKTOKEN_AVAILABLE:
            try:
                self._encoder = tiktoken.get_encoding(encoding_name)
            except Exception as e:
                logger.warning(f"Failed to initialize tiktoken encoder: {e}")
                self._encoder = None
        else:
            logger.warning("tiktoken not available, token counting will be approximate")

    def count_tokens(self, text: str) -> int:
        """
        Count tokens in the given text.

        Args:
            text: Text to count tokens for

        Returns:
            Number of tokens (approximate if tiktoken is not available)
        """
        if not text:
            return 0

        if self._encoder:
            try:
                return len(self._encoder.encode(text))
            except Exception as e:
                logger.warning(f"Token encoding error: {e}, falling back to approximation")

        # Fallback: approximate token count (1 token ~= 4 characters for English/code)
        # For Russian text, this is less accurate but gives a rough estimate
        return max(1, len(text) // 4)

    def count_message_tokens(self, message: str, role: str = "user") -> int:
        """
        Count tokens for a chat message including role overhead.

        Args:
            message: Message text
            role: Message role (user/assistant/system)

        Returns:
            Number of tokens including overhead
        """
        # ChatML format adds some overhead per message
        # <|im_start|>role\ncontent<|im_end|>
        # Approximate overhead: ~4 tokens per message
        message_overhead = 4
        return self.count_tokens(message) + message_overhead


# Global singleton instance
_counter: Optional[TokenCounter] = None


def get_token_counter() -> TokenCounter:
    """Get global TokenCounter instance."""
    global _counter
    if _counter is None:
        _counter = TokenCounter()
    return _counter


def count_tokens(text: str) -> int:
    """
    Count tokens in text using global counter.

    Args:
        text: Text to count tokens for

    Returns:
        Number of tokens
    """
    return get_token_counter().count_tokens(text)
