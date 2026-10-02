"""Validation helpers that mimic the zod 4 schemas (and JS coercions) used by the original Next.js server actions.

Only the first problem is reported, in schema order, with zod's default wording unless the schema supplied its own
message. Used by the tours and routing admin routers.
"""

import math
from typing import Any, Iterable

from app.errors import UserError

NAN = float("nan")


def js_type(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


def fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else repr(float(n))


def invalid_type(expected: str, v: Any, missing: bool = False) -> UserError:
    received = "undefined" if missing else js_type(v)
    if received == "number" and isinstance(v, float) and math.isnan(v):
        received = "NaN"
    return UserError(f"Invalid input: expected {expected}, received {received}")


def truthy(v: Any) -> bool:
    """JavaScript truthiness."""
    if v is None or v is False or v == "" or v == 0:
        return False
    if isinstance(v, float) and math.isnan(v):
        return False
    return True


def js_number(v: Any) -> float:
    """JavaScript Number(v) for JSON-ish values (NaN when it does not parse)."""
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return 0.0
        try:
            return float(s)
        except ValueError:
            return NAN
    if isinstance(v, list):
        return js_number(v[0]) if len(v) == 1 else (0.0 if not v else NAN)
    return NAN


def num_out(n: float | None):
    """Whole numbers as int so the stored/serialised value matches what JS would print."""
    if n is None:
        return None
    return int(n) if float(n).is_integer() and abs(n) < 1e15 else n


def z_number(v: Any, lo: float | None = None, hi: float | None = None, integer: bool = False, missing: bool = False):
    if missing or isinstance(v, bool) or not isinstance(v, (int, float)) or (isinstance(v, float) and not math.isfinite(v)):
        raise invalid_type("number", v, missing)
    if integer and not float(v).is_integer():
        raise UserError("Invalid input: expected int, received number")
    if lo is not None and v < lo:
        raise UserError(f"Too small: expected number to be >={fmt(lo)}")
    if hi is not None and v > hi:
        raise UserError(f"Too big: expected number to be <={fmt(hi)}")
    return int(v) if integer else num_out(v)


def opt_num(v: Any, lo: float, hi: float):
    """z.preprocess(v === '' || v == null ? null : Number(v), z.number().min(lo).max(hi).nullable())"""
    if v is None or v == "":
        return None
    return z_number(js_number(v), lo, hi)


def opt_text(v: Any, max_len: int) -> str | None:
    """z.preprocess(v === '' || v == null ? null : String(v).trim(), z.string().max(n).nullable())"""
    if v is None or v == "":
        return None
    s = js_string(v).strip()
    if len(s) > max_len:
        raise UserError(f"Too big: expected string to have <={max_len} characters")
    return s


def js_string(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if v is None:
        return "null"
    return str(v)


def z_string(v: Any, min_len: int = 0, max_len: int | None = None, min_message: str | None = None, missing: bool = False) -> str:
    """z.string().trim().min(min_len).max(max_len)"""
    if missing or not isinstance(v, str):
        raise invalid_type("string", v, missing)
    s = v.strip()
    if len(s) < min_len:
        raise UserError(min_message or f"Too small: expected string to have >={min_len} characters")
    if max_len is not None and len(s) > max_len:
        raise UserError(f"Too big: expected string to have <={max_len} characters")
    return s


def z_bool(v: Any, missing: bool = False) -> bool:
    if missing or not isinstance(v, bool):
        raise invalid_type("boolean", v, missing)
    return v


def z_enum(v: Any, options: Iterable[str]) -> str:
    options = list(options)
    if not isinstance(v, str) or v not in options:
        raise UserError("Invalid option: expected one of " + "|".join(f'"{o}"' for o in options))
    return v


def z_array(v: Any, max_items: int | None = None) -> list:
    if not isinstance(v, list):
        raise invalid_type("array", v)
    if max_items is not None and len(v) > max_items:
        raise UserError(f"Too big: expected array to have <={max_items} items")
    return v
