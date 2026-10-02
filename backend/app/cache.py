"""Tiny in-process TTL cache for read-mostly public data. Any write request in this process clears it."""

import time
from typing import Any, Callable

_store: dict[Any, tuple[float, Any]] = {}


def get_or_set(key: Any, ttl: float, build: Callable[[], Any]) -> Any:
    now = time.monotonic()
    hit = _store.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = build()
    _store[key] = (now + ttl, value)
    return value


def clear() -> None:
    _store.clear()
