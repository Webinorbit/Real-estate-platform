"""Small, explicit input validation helpers.

They raise UserError with the same human-friendly messages the original (zod-based) forms showed, so the
admin UI keeps its wording and only the first problem is reported.
"""

import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable

from app.errors import UserError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
ID_RE = re.compile(r"^[\w-]{10,40}$")


def blank(v) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def opt_text(v, max_len: int, label: str = "Text") -> str | None:
    if blank(v):
        return None
    s = str(v).strip()
    if len(s) > max_len:
        raise UserError(f"{label} must be {max_len} characters or fewer")
    return s


def req_text(v, label: str, min_len: int = 1, max_len: int = 200, message: str | None = None) -> str:
    s = "" if v is None else str(v).strip()
    if len(s) < min_len:
        raise UserError(message or f"{label} is required")
    if len(s) > max_len:
        raise UserError(f"{label} must be {max_len} characters or fewer")
    return s


def text_default(v, max_len: int, label: str = "Text", default: str = "") -> str:
    if v is None:
        return default
    s = str(v).strip()
    if len(s) > max_len:
        raise UserError(f"{label} must be {max_len} characters or fewer")
    return s


def number(v, label: str, lo: float | None = None, hi: float | None = None, integer: bool = False, default: float | None = None, message: str | None = None):
    if blank(v) and default is not None:
        return default
    try:
        if isinstance(v, bool):
            raise ValueError
        n = float(v)
    except (TypeError, ValueError):
        raise UserError(message or f"{label} must be a number") from None
    if not math.isfinite(n):
        raise UserError(message or f"{label} must be a number")
    if integer and n != int(n):
        raise UserError(f"{label} must be a whole number")
    if lo is not None and n < lo:
        raise UserError(message or f"{label} must be at least {lo:g}")
    if hi is not None and n > hi:
        raise UserError(message or f"{label} must be at most {hi:g}")
    return int(n) if integer else n


def opt_number(v, label: str, lo: float | None = None, hi: float | None = None, integer: bool = False):
    if blank(v):
        return None
    return number(v, label, lo, hi, integer)


def choice(v, options: Iterable[str], label: str, default: str | None = None) -> str:
    options = list(options)
    if v is None and default is not None:
        return default
    if v not in options:
        raise UserError(f"{label} is not valid")
    return v


def boolean(v, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, str):
        return v.lower() in ("1", "true", "yes", "on")
    return bool(v)


def str_list(v, max_items: int, max_len: int = 80, allowed: Iterable[str] | None = None, label: str = "List") -> list[str]:
    if v is None:
        return []
    if not isinstance(v, list):
        raise UserError(f"{label} must be a list")
    if len(v) > max_items:
        raise UserError(f"{label} has too many items")
    out = []
    for item in v:
        s = str(item).strip()
        if not s or len(s) > max_len:
            raise UserError(f"{label} contains an invalid entry")
        out.append(s)
    if allowed is not None:
        allowed = set(allowed)
        out = [s for s in out if s in allowed]
    return out


def email(v, message: str = "Enter a valid email", max_len: int = 200) -> str:
    s = str(v or "").strip()
    if not EMAIL_RE.match(s) or len(s) > max_len:
        raise UserError(message)
    return s


def opt_email(v, message: str) -> str | None:
    return None if blank(v) else email(v, message)


def https_url(v, message: str = "Links must start with https://", max_len: int = 300, allow_http: bool = True) -> str | None:
    if blank(v):
        return None
    s = str(v).strip()
    pattern = r"^https?://" if allow_http else r"^https://"
    if len(s) > max_len or not re.match(pattern, s, re.I):
        raise UserError(message)
    return s


def parse_dt(v) -> datetime | None:
    """ISO-8601 -> naive UTC datetime (None if blank or unparsable)."""
    if blank(v):
        return None
    try:
        dt = datetime.fromisoformat(str(v).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def require_dict(v: Any, label: str = "Request") -> dict:
    if not isinstance(v, dict):
        raise UserError(f"{label} must be an object")
    return v
