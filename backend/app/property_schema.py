"""Property input validation: a port of src/lib/property-schema.js (zod 4).

Limits, coercions, normalisation and message wording match the zod schema: the first failing field (in schema
order) is reported as `<Path>: <issue>` with the first letter capitalised, e.g. `Beds: Too big: expected number
to be <=50`. Unknown keys are dropped, exactly like `z.object` does.
"""

import math
import re
from typing import Any

from app.constants import AMENITIES, PROPERTY_STATUSES, PROPERTY_TYPES
from app.errors import UserError


class _Undefined:
    def __repr__(self) -> str:
        return "undefined"


UNDEF = _Undefined()


class Issue(Exception):
    def __init__(self, path: list, message: str):
        super().__init__(message)
        self.path = path
        self.message = message

    def dotted(self) -> str:
        return ".".join(str(p) for p in self.path)


def js_type(v: Any) -> str:
    if v is UNDEF:
        return "undefined"
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "NaN" if isinstance(v, float) and math.isnan(v) else "number"
    if isinstance(v, str):
        return "string"
    if isinstance(v, list):
        return "array"
    return "object"


_DECIMAL = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def js_number(v: Any) -> float:
    """JavaScript `Number(v)` for JSON-ish values."""
    if v is UNDEF:
        return math.nan
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
        if _DECIMAL.match(s):
            return float(s)
        if re.match(r"^0[xX][0-9a-fA-F]+$", s):
            return float(int(s, 16))
        if s in ("Infinity", "+Infinity"):
            return math.inf
        if s == "-Infinity":
            return -math.inf
        return math.nan
    return math.nan


def js_string(v: Any) -> str:
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return ",".join("" if x is None else js_string(x) for x in v)
    return "[object Object]"


def js_truthy(v: Any) -> bool:
    if v is None or v is UNDEF:
        return False
    if isinstance(v, (bool, int, float)):
        return bool(v) and not (isinstance(v, float) and math.isnan(v))
    if isinstance(v, str):
        return v != ""
    return True


def _fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else str(n)


def _units(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def _string(v, path, *, trim=True, min_len=0, min_msg=None, max_len=None, default=UNDEF) -> str:
    if v is UNDEF and default is not UNDEF:
        return default
    if not isinstance(v, str):
        raise Issue(path, f"Invalid input: expected string, received {js_type(v)}")
    s = v.strip() if trim else v
    if min_len and _units(s) < min_len:
        raise Issue(path, min_msg or f"Too small: expected string to have >={min_len} characters")
    if max_len is not None and _units(s) > max_len:
        raise Issue(path, f"Too big: expected string to have <={max_len} characters")
    return s


def _opt_text(v, path, max_len: int) -> str | None:
    if v is UNDEF or v is None or v == "":
        return None
    s = js_string(v).strip()
    if _units(s) > max_len:
        raise Issue(path, f"Too big: expected string to have <={max_len} characters")
    return s


def _number(n: float, path, lo=None, hi=None, integer=False):
    if math.isnan(n):
        raise Issue(path, "Invalid input: expected number, received NaN")
    if math.isinf(n):
        raise Issue(path, f"Invalid input: expected number, received {'Infinity' if n > 0 else '-Infinity'}")
    if integer and not n.is_integer():
        raise Issue(path, "Invalid input: expected int, received number")
    if lo is not None and n < lo:
        raise Issue(path, f"Too small: expected number to be >={_fmt(lo)}")
    if hi is not None and n > hi:
        raise Issue(path, f"Too big: expected number to be <={_fmt(hi)}")
    return int(n) if integer else n


def _coerced(v, path, lo=None, hi=None, integer=False, default=UNDEF):
    if v is UNDEF and default is not UNDEF:
        return default
    return _number(js_number(v), path, lo, hi, integer)


def _nullable_int(v, path, lo: int, hi: int) -> int | None:
    if v is UNDEF or v is None or v == "":
        return None
    return _number(js_number(v), path, lo, hi, True)


def _enum(v, path, options: list[str]) -> str:
    if not isinstance(v, str) or v not in options:
        raise Issue(path, "Invalid option: expected one of " + "|".join(f'"{o}"' for o in options))
    return v


def _amenities(v, path) -> list[str]:
    if v is UNDEF:
        return []
    if not isinstance(v, list):
        raise Issue(path, f"Invalid input: expected array, received {js_type(v)}")
    for i, item in enumerate(v):
        if not isinstance(item, str):
            raise Issue([*path, i], f"Invalid input: expected string, received {js_type(item)}")
    return [x for x in v if x in AMENITIES]


def _images(v, path) -> list[dict]:
    if v is UNDEF:
        return []
    if not isinstance(v, list):
        raise Issue(path, f"Invalid input: expected array, received {js_type(v)}")
    out = []
    for i, item in enumerate(v):
        here = [*path, i]
        if not isinstance(item, dict):
            raise Issue(here, f"Invalid input: expected object, received {js_type(item)}")
        url = _string(item.get("url", UNDEF), [*here, "url"], trim=False, min_len=1, max_len=600)
        alt = _string(item.get("alt", UNDEF), [*here, "alt"], trim=False, max_len=200, default="")
        out.append({"url": url, "alt": alt})
    if len(out) > 40:
        raise Issue(path, "Too big: expected array to have <=40 items")
    return out


def validate_property(raw: Any) -> dict:
    """Returns the normalised property dict or raises `Issue` for the first problem."""
    if not isinstance(raw, dict):
        raise Issue([], f"Invalid input: expected object, received {js_type(raw)}")
    g = lambda k: raw.get(k, UNDEF)  # noqa: E731

    return {
        "title": _string(g("title"), ["title"], min_len=3, min_msg="Give the listing a title", max_len=140),
        "description": _string(g("description"), ["description"], trim=False, max_len=10000, default=""),
        "listingType": _enum(g("listingType"), ["listingType"], ["SALE", "RENT"]),
        "type": _enum(g("type"), ["type"], PROPERTY_TYPES),
        "status": _enum(g("status"), ["status"], PROPERTY_STATUSES),
        "price": _coerced(g("price"), ["price"], lo=1, hi=1e12),
        "priceUnit": _opt_text(g("priceUnit"), ["priceUnit"], 20),
        "beds": _coerced(g("beds"), ["beds"], 0, 50, True, default=0),
        "baths": _coerced(g("baths"), ["baths"], 0, 50, True, default=0),
        "areaSqft": _coerced(g("areaSqft"), ["areaSqft"], 0, 10_000_000, default=0),
        "yearBuilt": _nullable_int(g("yearBuilt"), ["yearBuilt"], 1800, 2100),
        "furnishing": _opt_text(g("furnishing"), ["furnishing"], 40),
        "parking": _coerced(g("parking"), ["parking"], 0, 50, True, default=0),
        "floor": _nullable_int(g("floor"), ["floor"], 0, 5000),
        "totalFloors": _nullable_int(g("totalFloors"), ["totalFloors"], 0, 5000),
        "facing": _opt_text(g("facing"), ["facing"], 30),
        "address": _string(g("address"), ["address"], max_len=240, default=""),
        "locality": _string(g("locality"), ["locality"], min_len=1, min_msg="Locality is required", max_len=80),
        "city": _string(g("city"), ["city"], min_len=1, min_msg="City is required", max_len=80),
        "state": _opt_text(g("state"), ["state"], 80),
        "postalCode": _opt_text(g("postalCode"), ["postalCode"], 12),
        "lat": _coerced(g("lat"), ["lat"], -90, 90),
        "lng": _coerced(g("lng"), ["lng"], -180, 180),
        "amenities": _amenities(g("amenities"), ["amenities"]),
        "images": _images(g("images"), ["images"]),
        "videoUrl": _opt_text(g("videoUrl"), ["videoUrl"], 400),
        "featured": js_truthy(g("featured")),
        "listingBrokerId": _opt_text(g("listingBrokerId"), ["listingBrokerId"], 40),
    }


def capitalise(s: str) -> str:
    return re.sub(r"^(\w)", lambda m: m.group(1).upper(), s)


def parse_property_input(raw: Any) -> dict:
    try:
        data = validate_property(raw)
    except Issue as issue:
        raise UserError(capitalise(f"{issue.dotted() or 'Form'}: {issue.message}")) from None
    if data["videoUrl"] and not re.match(r"^https?://", data["videoUrl"], re.I):
        raise UserError("Video link must start with https://")
    return data
