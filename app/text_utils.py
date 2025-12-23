"""Utility functions for text processing and truncation."""

from typing import Tuple
from .config import Settings


def truncate_text(text: str, max_length: int) -> Tuple[str, bool]:
    """
    Truncate text to max_length characters and return tuple (truncated_text, was_truncated).

    Args:
        text: Text to truncate
        max_length: Maximum allowed length in characters

    Returns:
        Tuple of (truncated_text, was_truncated_flag)
    """
    if not text or len(text) <= max_length:
        return text, False

    return text[:max_length], True


def prepare_message_for_upstream(message: str, settings: Settings) -> Tuple[str, bool]:
    """
    Prepare message for sending to upstream server, applying global length limit.

    Args:
        message: Original message text
        settings: Application settings with ONEC_AI_INPUT_MAX_LENGTH

    Returns:
        Tuple of (prepared_message, was_truncated_flag)
    """
    max_length = settings.ONEC_AI_INPUT_MAX_LENGTH
    truncated_text, was_truncated = truncate_text(message, max_length)

    if was_truncated:
        # Add truncation notice to inform upstream that context was truncated
        truncation_notice = f"\n\n[TRUNCATED: Original message length was {len(message)} characters, truncated to {max_length} characters]"

        # Reserve space for truncation notice
        available_length = max_length - len(truncation_notice)
        if available_length > 0:
            truncated_text = message[:available_length] + truncation_notice
        else:
            # If notice itself is too long, just truncate without notice
            truncated_text = message[:max_length]

    return truncated_text, was_truncated
