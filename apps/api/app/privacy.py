"""Privacy-safe logging helpers. Never log raw submitted text by default."""

from __future__ import annotations

import hashlib
import logging
import re

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
DIGITS_RE = re.compile(r"\d")


def redact_text(text: str) -> str:
    redacted = EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    redacted = PHONE_RE.sub("[REDACTED_PHONE]", redacted)
    redacted = DIGITS_RE.sub("X", redacted)
    if len(redacted) > 120:
        redacted = redacted[:117] + "..."
    return redacted


def text_fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.getMessage())
        if "text=" in msg.lower() or "@" in msg:
            record.msg = redact_text(msg)
            record.args = ()
        return True


def configure_logging(log_raw_text: bool = False) -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
    if not log_raw_text:
        for handler in logging.getLogger().handlers:
            handler.addFilter(RedactingFilter())