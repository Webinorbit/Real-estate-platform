"""Property search: filter parsing (URL state), SQL prefilter, exact polygon / radius refinement."""

import json
from typing import Mapping

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.geo import haversine_km, point_in_polygon, polygon_bounds, radius_bounds, to_polygon
from app.models import Property, Tour
from app.serialize import ser

MAX_RESULTS = 500
SORTS = ("featured", "newest", "price_asc", "price_desc", "area_desc")


def _num(v):
    if v in (None, ""):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


def _list(v) -> list[str]:
    return [s.strip() for s in str(v or "").split(",") if s.strip()]


def parse_filters(params: Mapping[str, str]) -> dict:
    get = lambda k: params.get(k)  # noqa: E731
    lt = str(get("lt") or "").upper()
    bbox = [_num(x) for x in _list(get("bbox"))]
    poly = None
    raw_poly = get("poly")
    if raw_poly:
        try:
            ring = json.loads(raw_poly)
            if isinstance(ring, list) and len(ring) >= 3:
                poly = ring
        except ValueError:
            poly = None
    near = [_num(x) for x in _list(get("near"))]
    return {
        "lt": lt if lt in ("RENT", "SALE") else "SALE",
        "min": _num(get("min")), "max": _num(get("max")),
        "beds": _num(get("beds")), "baths": _num(get("baths")),
        "types": [t.upper() for t in _list(get("types"))],
        "amen": _list(get("amen")),
        "q": str(get("q") or "")[:100],
        "minArea": _num(get("minArea")), "maxArea": _num(get("maxArea")),
        "tour": get("tour") == "1", "feat": get("feat") == "1",
        "sort": get("sort") if get("sort") in SORTS else "featured",
        "bbox": bbox if len(bbox) == 4 and all(x is not None for x in bbox) else None,
        "poly": poly,
        "near": near if len(near) == 3 and all(x is not None for x in near) else None,
    }


def _intersect(a: dict, b: dict) -> dict:
    return {"west": max(a["west"], b["west"]), "east": min(a["east"], b["east"]), "south": max(a["south"], b["south"]), "north": min(a["north"], b["north"])}


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def published_tour_exists():
    return exists().where(Tour.propertyId == Property.id, Tour.published.is_(True))


def build_conditions(f: dict):
    conds = [Property.status == "ACTIVE", Property.listingType == f["lt"]]
    if f["min"] is not None:
        conds.append(Property.price >= f["min"])
    if f["max"] is not None:
        conds.append(Property.price <= f["max"])
    if f["beds"] is not None:
        conds.append(Property.beds >= f["beds"])
    if f["baths"] is not None:
        conds.append(Property.baths >= f["baths"])
    if f["types"]:
        conds.append(Property.type.in_(f["types"]))
    if f["amen"]:
        conds.append(Property.amenities.contains(f["amen"]))
    if f["minArea"] is not None:
        conds.append(Property.areaSqft >= f["minArea"])
    if f["maxArea"] is not None:
        conds.append(Property.areaSqft <= f["maxArea"])
    if f["feat"]:
        conds.append(Property.featured.is_(True))
    if f["tour"]:
        conds.append(published_tour_exists())
    if f["q"].strip():
        like = f"%{_escape_like(f['q'].strip())}%"
        conds.append(or_(*(col.ilike(like, escape="\\") for col in (Property.title, Property.locality, Property.city, Property.address, Property.description))))

    box = None
    if f["bbox"]:
        west, south, east, north = f["bbox"]
        box = {"west": west, "south": south, "east": east, "north": north}
    poly = to_polygon(f["poly"]) if f["poly"] else None
    if poly:
        b = polygon_bounds(poly["coordinates"][0])
        box = _intersect(box, b) if box else b
    if f["near"]:
        lat, lng, km = f["near"]
        b = radius_bounds(lat, lng, km)
        box = _intersect(box, b) if box else b
    if box:
        conds.append(and_(Property.lat >= box["south"], Property.lat <= box["north"]))
        if box["west"] <= box["east"]:  # viewports crossing the antimeridian skip the longitude prefilter
            conds.append(and_(Property.lng >= box["west"], Property.lng <= box["east"]))
    return conds, poly


def order_by(sort: str):
    if sort == "newest":
        return [Property.createdAt.desc()]
    if sort == "price_asc":
        return [Property.price.asc()]
    if sort == "price_desc":
        return [Property.price.desc()]
    if sort == "area_desc":
        return [Property.areaSqft.desc()]
    return [Property.featured.desc(), Property.createdAt.desc()]


def to_lite(p: Property, has_tour: bool) -> dict:
    images = p.images if isinstance(p.images, list) else []
    out = ser(
        p,
        only=("id", "slug", "title", "price", "listingType", "priceUnit", "type", "beds", "baths", "areaSqft", "locality", "city", "lat", "lng", "featured", "createdAt"),
        images=images[:4], hasTour=bool(has_tour),
    )
    return out


def search_properties(db: Session, f: dict, limit: int = MAX_RESULTS) -> dict:
    """Runs the search on a tenant-bound session. Polygon and radius are refined exactly after the SQL bbox prefilter."""
    conds, poly = build_conditions(f)
    take = min(limit, MAX_RESULTS)
    rows = db.execute(select(Property, published_tour_exists().label("hasTour")).where(*conds).order_by(*order_by(f["sort"])).limit(take + 1)).all()
    items = list(rows)
    if poly:
        items = [r for r in items if point_in_polygon(r[0].lng, r[0].lat, poly)]
    if f["near"]:
        lat, lng, km = f["near"]
        items = [r for r in items if haversine_km({"lat": lat, "lng": lng}, {"lat": r[0].lat, "lng": r[0].lng}) <= km]
    truncated = len(rows) > limit
    if truncated:
        items = items[:limit]
    return {"items": [to_lite(p, has) for p, has in items], "total": len(items), "truncated": truncated}


def lite_by_ids(db: Session, ids: list[str], statuses=("ACTIVE", "PENDING", "SOLD", "RENTED")) -> list[dict]:
    if not ids:
        return []
    rows = db.execute(select(Property, published_tour_exists().label("hasTour")).where(Property.id.in_(ids), Property.status.in_(statuses))).all()
    order = {pid: i for i, pid in enumerate(ids)}
    rows.sort(key=lambda r: order[r[0].id])
    return [to_lite(p, has) for p, has in rows]


def localities(db: Session, limit: int = 12, listing_type: str | None = None) -> list[dict]:
    q = select(Property.locality, func.count(Property.id).label("n")).where(Property.status == "ACTIVE", Property.locality != "")
    if listing_type:
        q = q.where(Property.listingType == listing_type)
    rows = db.execute(q.group_by(Property.locality).order_by(func.count(Property.id).desc(), Property.locality.asc()).limit(limit)).all()
    return [{"label": label, "count": n} for label, n in rows if label]
