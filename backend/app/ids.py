import secrets
import time

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _base36(n: int) -> str:
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = _ALPHABET[r] + out
    return out or "0"


def new_id() -> str:
    """cuid-like identifier: sortable by creation time, URL safe, compatible with the existing Prisma-era rows."""
    return "c" + _base36(int(time.time() * 1000)) + secrets.token_hex(8)
