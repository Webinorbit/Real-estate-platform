"""Public (visitor-facing) API. The tenant is resolved from the request host, never from the payload."""

import logging
import re
import time

import httpx
from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.config import env
from app.deps import STAFF, Ctx, current_user, public_ctx
from app.errors import NotFound, UserError
from app.geo import haversine_km
from app.models import Broker, Favorite, Property, SavedSearch, Tenant, Tour
from app.plans import can, features_json
from app.rate_limit import client_ip, rate_limit
from app.routing.service import create_and_route_lead, public_broker_card
from app.search import lite_by_ids, localities, parse_filters, search_properties, to_lite, published_tour_exists
from app.serialize import ser
from app.validate import EMAIL_RE, ID_RE, boolean, parse_dt

log = logging.getLogger("public")
router = APIRouter(prefix="/api")

NO_STORE = {"Cache-Control": "private, max-age=0, must-revalidate"}


def public_tenant(tenant: Tenant) -> dict:
    return ser(tenant, exclude=("webhookUrl",))


def _tour_with_scenes(tour: Tour, scenes: list) -> dict:
    return ser(tour, scenes=[ser(s) for s in scenes])


@router.get("/public/tenant")
def get_tenant(ctx: Ctx = Depends(public_ctx)):
    return {"tenant": public_tenant(ctx.tenant), "features": features_json(ctx.tenant)}


@router.get("/public/home")
def get_home(ctx: Ctx = Depends(public_ctx)):
    db, tenant = ctx.db, ctx.tenant
    stats = {
        "properties": db.scalar(select(func.count(Property.id)).where(Property.status == "ACTIVE")),
        "brokers": db.scalar(select(func.count(Broker.id)).where(Broker.active.is_(True))),
        "tours": db.scalar(select(func.count(Tour.id)).where(Tour.published.is_(True))),
        "cities": db.scalar(select(func.count(func.distinct(Property.city))).where(Property.status == "ACTIVE")),
    }
    locs = localities(db, 10)

    featured_rows = db.execute(
        select(Property, published_tour_exists().label("hasTour")).where(Property.status == "ACTIVE", Property.featured.is_(True)).order_by(Property.createdAt.desc()).limit(8)
    ).all()

    tile_areas = locs[:6]
    representatives = db.scalars(
        select(Property).distinct(Property.locality)
        .where(Property.locality.in_([a["label"] for a in tile_areas]), Property.status == "ACTIVE")
        .order_by(Property.locality, Property.featured.desc(), Property.createdAt.desc())
    ).all() if tile_areas else []
    by_locality = {p.locality: p for p in representatives}

    tiles = []
    for area in tile_areas:
        p = by_locality.get(area["label"])
        images = p.images if p and isinstance(p.images, list) else []
        tiles.append({**area, "image": (images[0].get("url") if images else None) or "/demo/photos/ext-01.jpg", "city": p.city if p else None})

    team = db.scalars(select(Broker).where(Broker.active.is_(True)).order_by(Broker.weight.desc(), Broker.name.asc()).limit(4)).all()

    spotlight = []
    if can(tenant, "tours"):
        tours = db.scalars(
            select(Tour).options(joinedload(Tour.property), joinedload(Tour.scenes)).where(Tour.published.is_(True)).order_by(Tour.createdAt.desc()).limit(4)
        ).unique().all()
        spotlight = [ser(t, property=ser(t.property), scenes=[ser(s, only=("id", "panoramaUrl", "name")) for s in t.scenes]) for t in tours]

    return {
        "stats": stats, "localities": locs, "featured": [to_lite(p, h) for p, h in featured_rows], "tiles": tiles,
        "team": [ser(b) for b in team], "tours": spotlight,
    }


@router.get("/public/localities")
def get_localities(limit: int = 30, listingType: str | None = None, ctx: Ctx = Depends(public_ctx)):
    return {"localities": localities(ctx.db, max(1, min(limit, 100)), listingType if listingType in ("SALE", "RENT") else None)}


@router.get("/properties")
def search(request: Request, ctx: Ctx = Depends(public_ctx)):
    filters = parse_filters(request.query_params)
    return JSONResponse(search_properties(ctx.db, filters), headers=NO_STORE)


@router.get("/properties/by-ids")
def by_ids(ids: str = "", ctx: Ctx = Depends(public_ctx)):
    wanted = [s.strip() for s in ids.split(",") if ID_RE.match(s.strip())][:60]
    return {"items": lite_by_ids(ctx.db, wanted)}


@router.get("/public/properties/{slug}")
def property_detail(slug: str, view: int = 0, ctx: Ctx = Depends(public_ctx)):
    db, tenant = ctx.db, ctx.tenant
    prop = db.scalars(select(Property).options(joinedload(Property.listingBroker)).where(Property.slug == slug)).first()
    if prop is None or prop.status == "DRAFT":
        raise NotFound("Property not found")

    tour = db.scalars(
        select(Tour).options(joinedload(Tour.scenes)).where(Tour.propertyId == prop.id, Tour.published.is_(True)).order_by(Tour.createdAt.asc()).limit(1)
    ).unique().first()

    if view:
        prop.views = (prop.views or 0) + 1
        db.commit()

    similar_rows = db.execute(
        select(Property, published_tour_exists().label("hasTour")).where(
            Property.id != prop.id, Property.status == "ACTIVE", Property.listingType == prop.listingType,
            Property.price >= prop.price * 0.55, Property.price <= prop.price * 1.8,
        ).order_by(Property.createdAt.desc()).limit(30)
    ).all()
    similar_rows.sort(key=lambda r: (-(r[0].city == prop.city), -(r[0].type == prop.type), abs(r[0].price - prop.price)))

    return {
        "property": ser(prop, listingBroker=ser(prop.listingBroker), tours=[_tour_with_scenes(tour, tour.scenes[:1])] if tour else []),
        "similar": [to_lite(p, h) for p, h in similar_rows[:3]],
        "toursEnabled": can(tenant, "tours"),
    }


@router.get("/public/compare")
def compare(ids: str = "", ctx: Ctx = Depends(public_ctx)):
    wanted = [s.strip() for s in ids.split(",") if ID_RE.match(s.strip())][:3]
    rows = ctx.db.scalars(select(Property).where(Property.id.in_(wanted))).all() if wanted else []
    by_id = {r.id: r for r in rows}
    return {"items": [ser(by_id[i]) for i in wanted if i in by_id]}


@router.get("/public/brokers")
def brokers(ctx: Ctx = Depends(public_ctx)):
    db = ctx.db
    rows = db.scalars(select(Broker).where(Broker.active.is_(True)).order_by(Broker.weight.desc(), Broker.name.asc())).all()
    counts = db.execute(
        select(Property.listingBrokerId, func.count(Property.id)).where(Property.status == "ACTIVE", Property.listingBrokerId.is_not(None)).group_by(Property.listingBrokerId)
    ).all()
    return {"brokers": [ser(b, exclude=("territory", "workingHours", "userId")) for b in rows], "listings": {bid: n for bid, n in counts}}


@router.get("/public/tours")
def tours(ctx: Ctx = Depends(public_ctx)):
    if not can(ctx.tenant, "tours"):
        raise NotFound("Tours are not enabled")
    rows = ctx.db.scalars(
        select(Tour).options(joinedload(Tour.property), joinedload(Tour.scenes)).where(Tour.published.is_(True)).order_by(Tour.createdAt.desc())
    ).unique().all()
    return {"tours": [ser(t, property=ser(t.property), scenes=[ser(s, only=("id", "panoramaUrl", "thumbUrl")) for s in t.scenes]) for t in rows]}


@router.get("/public/tours/{tour_id}")
def tour_detail(tour_id: str, draft: int = 0, ctx: Ctx = Depends(public_ctx)):
    """A tour with scenes and hotspots for the viewer. Drafts are visible only to signed-in non-broker staff."""
    if not can(ctx.tenant, "tours"):
        raise NotFound("Tour not found")
    allow_draft = False
    if draft:
        user = current_user(ctx)
        allow_draft = bool(user and (user.role == "SUPER" or user.role in STAFF))
    tour = ctx.db.scalars(
        select(Tour).options(joinedload(Tour.property), joinedload(Tour.scenes)).where(Tour.id == tour_id)
    ).unique().first()
    if tour is None or (not tour.published and not allow_draft):
        raise NotFound("Tour not found")

    plan = tour.planFloors if isinstance(tour.planFloors, dict) else None
    scenes = []
    for s in tour.scenes:
        hotspots = [ser(h, only=("id", "type", "yaw", "pitch", "label", "content", "targetSceneId")) for h in s.hotspots]
        scenes.append(
            ser(s, only=("id", "name", "roomLabel", "panoramaUrl", "lat", "lng", "planX", "planY", "northYaw", "initialYaw"), thumbUrl=s.thumbUrl or s.panoramaUrl, hotspots=hotspots)
        )
    p = tour.property
    return {
        "id": tour.id, "title": tour.title, "kind": tour.kind, "externalUrl": tour.externalUrl, "floorPlanUrl": tour.floorPlanUrl,
        "plan": {"width": plan.get("width") or 800, "height": plan.get("height") or 520, "label": plan.get("label") or "Floor plan"} if plan else None,
        "autoRotate": tour.autoRotate, "startSceneId": tour.startSceneId or (tour.scenes[0].id if tour.scenes else None),
        "property": ser(p, only=("id", "slug", "title", "locality", "city", "price", "listingType", "priceUnit")),
        "scenes": scenes,
    }


@router.get("/public/sitemap")
def sitemap_data(ctx: Ctx = Depends(public_ctx)):
    db = ctx.db
    props = db.execute(select(Property.slug, Property.updatedAt).where(Property.status.in_(["ACTIVE", "SOLD", "RENTED"]))).all()
    tour_rows = db.execute(select(Tour.id, Tour.updatedAt).where(Tour.published.is_(True))).all() if can(ctx.tenant, "tours") else []
    return {
        "properties": [{"slug": s, "updatedAt": u.isoformat() + "Z"} for s, u in props],
        "tours": [{"id": i, "updatedAt": u.isoformat() + "Z"} for i, u in tour_rows],
        "toursEnabled": can(ctx.tenant, "tours"),
    }


@router.get("/suggest")
def suggest(q: str = "", ctx: Ctx = Depends(public_ctx)):
    db = ctx.db
    q = q.strip()[:60]
    if not q:
        return {"localities": localities(db, 6), "properties": []}
    like = f"%{q.replace(chr(92), chr(92) * 2).replace('%', chr(92) + '%').replace('_', chr(92) + '_')}%"
    loc_rows = db.execute(
        select(Property.locality, func.count(Property.id)).where(Property.status == "ACTIVE", Property.locality.ilike(like, escape="\\"))
        .group_by(Property.locality).order_by(func.count(Property.id).desc()).limit(5)
    ).all()
    props = db.execute(
        select(Property.slug, Property.title, Property.locality, Property.price)
        .where(Property.status == "ACTIVE", (Property.title.ilike(like, escape="\\")) | (Property.locality.ilike(like, escape="\\")) | (Property.city.ilike(like, escape="\\")))
        .order_by(Property.featured.desc(), Property.createdAt.desc()).limit(6)
    ).all()
    return {
        "localities": [{"label": label, "count": n} for label, n in loc_rows],
        "properties": [{"slug": s, "title": t, "locality": loc, "price": pr} for s, t, loc, pr in props],
    }


# ---------------------------------------------------------------- nearby places (OpenStreetMap / Overpass)

_nearby_cache: dict[str, tuple[float, list]] = {}
_NEARBY_TTL = 12 * 60 * 60
CATEGORIES = {
    "school": ("Schools", lambda t: t.get("amenity") in ("school", "college", "university", "kindergarten")),
    "health": ("Healthcare", lambda t: t.get("amenity") in ("hospital", "clinic", "pharmacy", "doctors")),
    "food": ("Food & cafes", lambda t: t.get("amenity") in ("restaurant", "cafe", "fast_food")),
    "shop": ("Shopping", lambda t: t.get("shop") in ("supermarket", "mall", "convenience")),
    "transit": ("Transit", lambda t: t.get("railway") == "station" or t.get("station") == "subway" or t.get("highway") == "bus_stop" or t.get("amenity") == "bus_station"),
    "park": ("Parks", lambda t: t.get("leisure") in ("park", "garden")),
}


def _overpass_query(lat: float, lng: float) -> str:
    r = 1400
    return f"""[out:json][timeout:12];(
node["amenity"~"^(school|college|university|kindergarten|hospital|clinic|pharmacy|doctors|restaurant|cafe|fast_food|bus_station)$"](around:{r},{lat},{lng});
node["shop"~"^(supermarket|mall|convenience)$"](around:{r},{lat},{lng});
node["railway"="station"](around:3000,{lat},{lng});
node["highway"="bus_stop"]["name"](around:{r},{lat},{lng});
node["leisure"~"^(park|garden)$"](around:{r},{lat},{lng});
way["leisure"="park"]["name"](around:{r},{lat},{lng});
);out center 220;"""


@router.get("/nearby")
def nearby(request: Request, lat: float = float("nan"), lng: float = float("nan")):
    labels = {k: v[0] for k, v in CATEGORIES.items()}
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return JSONResponse({"error": "Invalid coordinates"}, status_code=400)
    key = f"{lat:.3f},{lng:.3f}"
    hit = _nearby_cache.get(key)
    if hit and hit[0] > time.time():
        return {"places": hit[1], "categories": labels}
    if not rate_limit(f"nearby:{client_ip(request)}", 30, 60)["ok"]:
        return JSONResponse({"places": [], "error": "rate limited"}, status_code=429)

    places: list[dict] = []
    try:
        res = httpx.post(
            "https://overpass-api.de/api/interpreter", data={"data": _overpass_query(lat, lng)},
            headers={"User-Agent": "WebInOrbit-RealEstate/1.0"}, timeout=14,
        )
        if res.is_success:
            seen: set[str] = set()
            for el in res.json().get("elements", []):
                tags = el.get("tags") or {}
                cat = next((k for k, (_, test) in CATEGORIES.items() if test(tags)), None)
                p_lat = el.get("lat", (el.get("center") or {}).get("lat"))
                p_lng = el.get("lon", (el.get("center") or {}).get("lon"))
                if not cat or p_lat is None or p_lng is None:
                    continue
                name = tags.get("name") or tags.get("name:en") or ("Transit stop" if cat == "transit" else None)
                if not name or f"{cat}:{name}" in seen:
                    continue
                seen.add(f"{cat}:{name}")
                places.append({"id": f"{el.get('type')}{el.get('id')}", "name": name, "cat": cat, "lat": p_lat, "lng": p_lng,
                               "km": round(haversine_km({"lat": lat, "lng": lng}, {"lat": p_lat, "lng": p_lng}), 2)})
            places.sort(key=lambda p: p["km"])
            per_cat: dict[str, int] = {}
            kept = []
            for p in places:
                per_cat[p["cat"]] = per_cat.get(p["cat"], 0) + 1
                if per_cat[p["cat"]] <= 8:
                    kept.append(p)
            places = kept
            _nearby_cache[key] = (time.time() + _NEARBY_TTL, places)
    except (httpx.HTTPError, ValueError) as err:
        log.warning("[nearby] %s", err)
    return {"places": places, "categories": labels}


# ---------------------------------------------------------------- geocoding (Nominatim proxy)

_geo_cache: dict[str, tuple[float, list]] = {}


@router.get("/geocode")
def geocode(q: str = "", cc: str | None = None, ctx: Ctx = Depends(public_ctx)):
    """Server-side proxy so we send a proper User-Agent, cache results and never expose visitor IPs to a third party."""
    tenant = ctx.tenant
    q = q.strip()[:120]
    if len(q) < 3:
        return {"results": []}
    key = f"{tenant.slug}:{q.lower()}"
    hit = _geo_cache.get(key)
    if hit and hit[0] > time.time():
        return {"results": hit[1]}

    d = 1.2
    params = {"q": q, "format": "jsonv2", "limit": "5", "addressdetails": "0",
              "viewbox": ",".join(str(x) for x in (tenant.mapLng - d, tenant.mapLat + d, tenant.mapLng + d, tenant.mapLat - d))}
    if cc:
        params["countrycodes"] = cc
    base = env("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
    try:
        res = httpx.get(f"{base}/search", params=params, timeout=6,
                        headers={"User-Agent": f"WebInOrbit-RealEstate/1.0 ({tenant.contactEmail or 'contact@webinorbit.com'})", "Accept-Language": "en"})
        if not res.is_success:
            return {"results": []}
        results = [{"label": r["display_name"], "lat": float(r["lat"]), "lng": float(r["lon"])} for r in res.json()]
    except (httpx.HTTPError, ValueError, KeyError):
        return {"results": []}
    _geo_cache[key] = (time.time() + 600, results)
    if len(_geo_cache) > 500:
        _geo_cache.pop(next(iter(_geo_cache)))
    return {"results": results}


# ---------------------------------------------------------------- leads, favourites, saved searches

LEAD_SOURCES = ("ENQUIRY", "TOUR_BOOKING", "CALLBACK", "CONTACT")


def _lead_errors(body: dict) -> dict:
    fields: dict[str, str] = {}
    name = str(body.get("name") or "").strip()
    if len(name) < 2:
        fields["name"] = "Please enter your name"
    elif len(name) > 120:
        fields["name"] = "Name is too long"
    mail = str(body.get("email") or "").strip()
    if not EMAIL_RE.match(mail) or len(mail) > 200:
        fields["email"] = "Enter a valid email"
    for key, limit in (("phone", 30), ("message", 2000), ("language", 40), ("preferredAt", 40)):
        if len(str(body.get(key) or "")) > limit:
            fields[key] = "Too long"
    if body.get("source") not in (None, "", *LEAD_SOURCES):
        fields["source"] = "Invalid source"
    budget = body.get("budget")
    if budget not in (None, ""):
        try:
            if float(budget) <= 0:
                raise ValueError
        except (TypeError, ValueError):
            fields["budget"] = "Budget must be a positive number"
    return fields


@router.post("/leads")
async def create_lead(request: Request, ctx: Ctx = Depends(public_ctx)):
    if not rate_limit(f"lead:{ctx.tenant.id}:{client_ip(request)}", 8, 600)["ok"]:
        return JSONResponse({"error": "Too many requests. Please try again shortly."}, status_code=429)
    try:
        body = await request.json()
    except ValueError:
        return JSONResponse({"error": "Invalid request"}, status_code=400)
    if not isinstance(body, dict):
        return JSONResponse({"error": "Invalid request"}, status_code=400)

    fields = _lead_errors(body)
    if fields:
        return JSONResponse({"error": "Please fix the highlighted fields", "fields": fields}, status_code=422)
    if body.get("website"):  # honeypot
        return {"ok": True}

    try:
        result = await run_in_threadpool(
            create_and_route_lead, ctx.db, ctx.tenant,
            {
                "name": str(body["name"]).strip(), "email": str(body["email"]).strip(), "phone": str(body.get("phone") or "").strip() or None,
                "message": str(body.get("message") or "").strip() or None, "language": str(body.get("language") or "").strip() or None,
                "propertyId": (str(body.get("propertyId") or "").strip() or None), "source": body.get("source") or "ENQUIRY",
                "preferredAt": parse_dt(body.get("preferredAt")), "budget": float(body["budget"]) if body.get("budget") not in (None, "") else None,
            },
        )
    except UserError as err:
        return JSONResponse({"error": err.message}, status_code=400)
    except Exception:  # noqa: BLE001
        log.exception("[leads] create failed")
        return JSONResponse({"error": "Could not submit your request"}, status_code=400)
    return {"ok": True, "leadId": result["lead"]["id"], "broker": result["broker"], "slaMinutes": result["slaMinutes"]}


def _visitor_id(request: Request) -> str | None:
    v = request.cookies.get("vid")
    return v if v and re.match(r"^[\w-]{16,64}$", v) else None


@router.post("/favorites")
def favorite(request: Request, body: Any = Body(default=None), ctx: Ctx = Depends(public_ctx)):
    vid = _visitor_id(request)
    if not vid or not isinstance(body, dict) or not body.get("propertyId") or not isinstance(body.get("on"), bool):
        return JSONResponse({"ok": False}, status_code=400)

    db, pid = ctx.db, str(body["propertyId"])
    if not db.scalar(select(Property.id).where(Property.id == pid)):
        return JSONResponse({"ok": False}, status_code=404)
    existing = db.scalars(select(Favorite).where(Favorite.visitorId == vid, Favorite.propertyId == pid)).first()
    if body["on"] and not existing:
        db.add(Favorite(visitorId=vid, propertyId=pid))
    elif not body["on"] and existing:
        db.delete(existing)
    db.commit()
    return {"ok": True}


@router.post("/saved-searches")
def save_search(request: Request, body: Any = Body(default=None), ctx: Ctx = Depends(public_ctx)):
    vid = _visitor_id(request)
    err = JSONResponse({"error": "Invalid request"}, status_code=400)
    if not vid or not isinstance(body, dict):
        return err
    name, query, mail = str(body.get("name") or "").strip(), str(body.get("query") or ""), body.get("email")
    if not 1 <= len(name) <= 60 or len(query) > 2000 or (mail and not EMAIL_RE.match(str(mail))):
        return err
    db = ctx.db
    if db.scalar(select(func.count(SavedSearch.id)).where(SavedSearch.visitorId == vid)) >= 25:
        return JSONResponse({"error": "Saved search limit reached"}, status_code=429)
    db.add(SavedSearch(visitorId=vid, name=name, email=str(mail).strip() if mail else None, query={"qs": query}))
    db.commit()
    return {"ok": True}


@router.delete("/saved-searches")
def delete_saved_search(request: Request, id: str = "", ctx: Ctx = Depends(public_ctx)):
    vid = _visitor_id(request)
    if not vid or not id:
        return JSONResponse({"error": "Invalid request"}, status_code=400)
    row = ctx.db.scalars(select(SavedSearch).where(SavedSearch.id == id, SavedSearch.visitorId == vid)).first()
    if row:
        ctx.db.delete(row)
        ctx.db.commit()
    return {"ok": True}
