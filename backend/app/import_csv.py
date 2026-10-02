"""CSV import helpers: a port of src/lib/import.js (column auto-mapping, row building, row checking)."""

import re
from typing import Any

from app.constants import PROPERTY_TYPE_LABELS, PROPERTY_TYPES
from app.property_schema import Issue, js_number, validate_property

IMPORT_FIELDS = [
    {"key": "title", "label": "Title", "required": True, "aliases": ["title", "name", "property name", "listing title"]},
    {"key": "listingType", "label": "Sale / Rent", "aliases": ["listing type", "listingtype", "for", "purpose", "sale or rent", "transaction"]},
    {"key": "type", "label": "Property type", "aliases": ["type", "property type", "category"]},
    {"key": "price", "label": "Price", "required": True, "aliases": ["price", "amount", "rent", "cost", "asking price"]},
    {"key": "beds", "label": "Bedrooms", "aliases": ["beds", "bedrooms", "bhk", "bed"]},
    {"key": "baths", "label": "Bathrooms", "aliases": ["baths", "bathrooms", "bath"]},
    {"key": "areaSqft", "label": "Area", "aliases": ["area", "sqft", "sq ft", "area sqft", "size", "carpet area", "builtup area"]},
    {"key": "locality", "label": "Locality", "required": True, "aliases": ["locality", "neighbourhood", "neighborhood", "area name", "suburb"]},
    {"key": "city", "label": "City", "required": True, "aliases": ["city", "town"]},
    {"key": "address", "label": "Address", "aliases": ["address", "street", "street address"]},
    {"key": "lat", "label": "Latitude", "aliases": ["lat", "latitude"]},
    {"key": "lng", "label": "Longitude", "aliases": ["lng", "lon", "long", "longitude"]},
    {"key": "description", "label": "Description", "aliases": ["description", "details", "about", "summary"]},
    {"key": "amenities", "label": "Amenities", "aliases": ["amenities", "features", "facilities"]},
    {"key": "images", "label": "Image URLs", "aliases": ["images", "image urls", "photos", "image", "photo urls", "pictures"]},
    {"key": "status", "label": "Status", "aliases": ["status"]},
    {"key": "yearBuilt", "label": "Year built", "aliases": ["year built", "yearbuilt", "year", "built"]},
    {"key": "furnishing", "label": "Furnishing", "aliases": ["furnishing", "furnished"]},
    {"key": "parking", "label": "Parking", "aliases": ["parking", "car parking"]},
    {"key": "floor", "label": "Floor", "aliases": ["floor"]},
    {"key": "totalFloors", "label": "Total floors", "aliases": ["total floors", "totalfloors", "floors"]},
    {"key": "facing", "label": "Facing", "aliases": ["facing", "direction"]},
    {"key": "state", "label": "State", "aliases": ["state", "region"]},
    {"key": "postalCode", "label": "Postal code", "aliases": ["postal code", "postalcode", "pincode", "zip", "zipcode", "postcode"]},
]

TEMPLATE_CSV = (
    "title,listing type,property type,price,bedrooms,bathrooms,area sqft,locality,city,latitude,longitude,description,amenities,image urls,status\n"
    '"Sea-view 3 BHK in Bandra","sale","apartment",42000000,3,3,1850,"Bandra West","Mumbai",19.0596,72.8295,"Bright corner apartment with sea views.","Gym; Swimming Pool; Lift","https://example.com/a.jpg|https://example.com/b.jpg","active"\n'
)


def norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str("" if s is None else s).lower()).strip()


def auto_map(headers: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    used: set[str] = set()
    for f in IMPORT_FIELDS:
        hit = next((h for h in headers if h not in used and norm(h) in f["aliases"]), None)
        if hit is not None:
            mapping[f["key"]] = hit
            used.add(hit)
    return mapping


def to_number(v: Any) -> int | float | str:
    if v is None or v == "":
        return ""
    n = js_number(re.sub(r"[^0-9.\-]", "", str(v)))
    if n != n or n in (float("inf"), float("-inf")):
        return ""
    return int(n) if n.is_integer() else n


def _label_matches(typ: str, raw: str) -> bool:
    label = norm(PROPERTY_TYPE_LABELS[typ])
    return norm(typ) == raw or label == raw or bool(raw and label.startswith(raw))


def build_row(raw: dict, mapping: dict) -> dict:
    """Builds a Property payload from one raw CSV row and a { fieldKey: csvHeader } mapping."""

    def get(k: str) -> str:
        col = mapping.get(k)
        if not col:
            return ""
        v = raw.get(col)
        return ("" if v is None else str(v)).strip()

    lt = get("listingType").lower()
    rent = bool(re.search(r"rent|lease", lt))
    type_raw = norm(get("type"))
    typ = next((t for t in PROPERTY_TYPES if _label_matches(t, type_raw)), "APARTMENT")
    status = get("status").upper()
    images = [u for u in (s.strip() for s in re.split(r"[|;\n]", get("images"))) if re.match(r"^https://", u, re.I)]
    bhk = re.search(r"\d+", get("beds"))
    lat, lng = get("lat"), get("lng")
    return {
        "title": get("title"),
        "description": get("description"),
        "listingType": "RENT" if rent else "SALE",
        "type": typ,
        "status": status if status in ("DRAFT", "ACTIVE", "PENDING", "SOLD", "RENTED") else "ACTIVE",
        "price": to_number(get("price")),
        "priceUnit": "month" if rent else None,
        "beds": int(bhk.group(0)) if bhk else 0,
        "baths": to_number(get("baths")) or 0,
        "areaSqft": to_number(get("areaSqft")) or 0,
        "yearBuilt": to_number(get("yearBuilt")),
        "furnishing": get("furnishing"),
        "parking": to_number(get("parking")) or 0,
        "floor": to_number(get("floor")),
        "totalFloors": to_number(get("totalFloors")),
        "facing": get("facing"),
        "address": get("address"),
        "locality": get("locality"),
        "city": get("city"),
        "state": get("state"),
        "postalCode": get("postalCode"),
        "lat": None if lat == "" else to_number(lat),
        "lng": None if lng == "" else to_number(lng),
        "amenities": [s for s in (x.strip() for x in re.split(r"[;|,]", get("amenities"))) if s],
        "images": [{"url": u, "alt": ""} for u in images],
        "featured": False,
    }


def _blank_coord(row: dict, key: str) -> bool:
    return key in row and (row[key] is None or row[key] == "")


def check_row(row: Any) -> dict:
    """Validates a built row. Missing coordinates are allowed (`needsGeocode`) and resolved server-side."""
    needs_geocode = isinstance(row, dict) and (_blank_coord(row, "lat") or _blank_coord(row, "lng"))
    probe = {**row, "lat": 0, "lng": 0} if needs_geocode else row
    try:
        validate_property(probe)
    except Issue as issue:
        return {"ok": False, "error": f"{issue.dotted() or 'row'}: {issue.message}", "needsGeocode": needs_geocode}
    return {"ok": True, "needsGeocode": needs_geocode}
