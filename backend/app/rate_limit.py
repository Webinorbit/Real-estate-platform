import threading
import time

_lock = threading.Lock()
_buckets: dict[str, dict] = {}


def rate_limit(key: str, limit: int = 10, window_s: float = 60.0) -> dict:
    """Fixed-window in-memory limiter. Fine for one process; swap for Redis when scaling out."""
    now = time.monotonic()
    with _lock:
        bucket = _buckets.get(key)
        if bucket is None or bucket["reset"] < now:
            _buckets[key] = {"count": 1, "reset": now + window_s}
            if len(_buckets) > 5000:
                for k in [k for k, v in _buckets.items() if v["reset"] < now]:
                    _buckets.pop(k, None)
            return {"ok": True, "remaining": limit - 1}
        bucket["count"] += 1
        return {"ok": bucket["count"] <= limit, "remaining": max(0, limit - bucket["count"]), "retry_after": int(bucket["reset"] - now) + 1}


def client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else request.headers.get("x-real-ip")) or (request.client.host if request.client else "local")
