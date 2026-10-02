"""Model -> JSON helpers. Output keys equal column names, dates are ISO-8601 UTC strings."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import inspect as sa_inspect


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat(timespec="milliseconds") + "Z" if value.tzinfo is None else value.isoformat()


def plain(value: Any) -> Any:
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [plain(v) for v in value]
    return value


def ser(obj, *, only: Iterable[str] | None = None, exclude: Iterable[str] = (), **extra) -> dict | None:
    """Column attributes of a mapped object as a dict. `extra` values are merged in (and made JSON-safe)."""
    if obj is None:
        return None
    mapper = sa_inspect(obj).mapper
    keys = [c.key for c in mapper.column_attrs]
    if only is not None:
        keys = [k for k in keys if k in set(only)]
    out = {k: plain(getattr(obj, k)) for k in keys if k not in set(exclude)}
    for k, v in extra.items():
        out[k] = plain(v)
    return out


def ser_all(objs: Iterable, **kwargs) -> list[dict]:
    return [ser(o, **kwargs) for o in objs]
