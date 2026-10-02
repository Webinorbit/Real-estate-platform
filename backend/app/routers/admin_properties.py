"""Admin: properties (listings). Port of src/app/admin/(panel)/properties/*.

Every endpoint requires a signed-in OWNER / ADMIN (or SUPER) of the request's tenant:
anonymous -> 401 {"error", "code": "unauthorized"}, BROKER -> 403 {"error", "code": "forbidden"}.
Failures are 400 {"error": "<message>"} using the same wording as the old server actions.
Mutations answer 200 {"ok": true, ...extra}. Prices etc. are raw numbers; the frontend formats them.

GET    /api/admin/properties?q=&status=&page=
         List page. `q` (alias `search`): case-insensitive match on title / locality / city (trimmed, max 80 chars).
         `status`: one of DRAFT|ACTIVE|PENDING|SOLD|RENTED (anything else is ignored). `page`: 1-based, 20 per page.
         -> {
              "rows": [Property + {"_count": {"leads": int, "tours": int}, "listingBroker": {"name": str} | null}],
                      (every Property column, ordered by updatedAt desc; images is [{url, alt}]),
              "total": int (rows matching the filter), "page": int, "pages": int, "pageSize": 20,
              "counts": {"ACTIVE": n, ...}   (per status, statuses with no rows are absent),
              "all": int (all properties of the tenant), "cap": int | null (null = unlimited maxListings),
              "atCap": bool, "plan": "STARTER"|"PRO"|"ENTERPRISE", "q": str, "status": str | null
            }

GET    /api/admin/properties/new
         Data of the "new property" page. -> {
              "atCap": bool (the page redirects to /admin/plan?locked=maxListings when true), "cap": int | null,
              "count": int, "brokers": [{"id", "name"}] (active brokers by name),
              "initial": the empty form values, "tenant": {"currency", "areaUnit", "mapLat", "mapLng", "mapZoom"}
            }

GET    /api/admin/properties/{id}
         Data of the edit page. 404 {"error": "Property not found"} when missing / other tenant. -> {
              "property": Property (raw row),
              "initial": the form values (nulls replaced by "" like the page did, images [{url, alt}]),
              "brokers": [{"id", "name"}], "tours": [{"id", "title", "published"}] (tours of this property),
              "tenant": {"currency", "areaUnit", "mapLat", "mapLng", "mapZoom"},
              "features": {"tours": bool, "csvImport": bool, ... (see plans.features_json)}
            }

POST   /api/admin/properties            (saveProperty(null, input))
PUT    /api/admin/properties/{id}       (saveProperty(id, input))
         Body: the property form object:
           {title, description, listingType: SALE|RENT, type, status, price, priceUnit, beds, baths, areaSqft,
            yearBuilt, furnishing, parking, floor, totalFloors, facing, address, locality, city, state, postalCode,
            lat, lng, amenities: [str], images: [{url, alt}] (max 40), videoUrl, featured, listingBrokerId}
         Same coercions / limits / messages as the zod schema ("Beds: Too big: expected number to be <=50").
         Create is refused past the plan cap: "Your starter plan allows 25 listings. Upgrade to add more."
         The slug is generated on create and regenerated on update only when the title changed.
         -> {"ok": true, "id": str}
         Other errors: "Listing agent not found", "Property not found" (update), "Video link must start with https://".

DELETE /api/admin/properties/{id}       (deleteProperty)   -> {"ok": true}   "Property not found"
POST   /api/admin/properties/{id}/status    Body {"status": "ACTIVE"}   (setPropertyStatus) -> {"ok": true}
         "Unknown status" for values outside DRAFT|ACTIVE|PENDING|SOLD|RENTED.
POST   /api/admin/properties/{id}/featured  Body {"featured": true}     (toggleFeatured)    -> {"ok": true}
"""

import math
import time
from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select

from app.constants import PROPERTY_STATUSES
from app.deps import AdminCtx, staff_only
from app.errors import NotFound, UserError
from app.models import Broker, Lead, Property, Tour
from app.plans import features_json, limit_of
from app.property_schema import js_number, js_truthy, parse_property_input
from app.serialize import ser
from app.slug import slugify

router = APIRouter(prefix="/api/admin/properties")

PAGE = 20


def tenant_map_json(tenant) -> dict:
    return {"currency": tenant.currency, "areaUnit": tenant.areaUnit, "mapLat": tenant.mapLat, "mapLng": tenant.mapLng, "mapZoom": tenant.mapZoom}


def cap_of(ctx: AdminCtx) -> float:
    return limit_of(ctx.tenant, "maxListings")


def property_count(ctx: AdminCtx) -> int:
    return ctx.db.scalar(select(func.count(Property.id))) or 0


def broker_options(ctx: AdminCtx) -> list[dict]:
    rows = ctx.db.execute(select(Broker.id, Broker.name).where(Broker.active.is_(True)).order_by(Broker.name.asc())).all()
    return [{"id": r.id, "name": r.name} for r in rows]


def find_property(ctx: AdminCtx, id: str) -> Property | None:
    return ctx.db.scalars(select(Property).where(Property.id == id)).first()


def unique_slug(ctx: AdminCtx, title: str, ignore_id: str | None = None) -> str:
    base = slugify(title) or "property"
    for i in range(30):
        slug = base if i == 0 else f"{base}-{i + 1}"
        query = select(Property.id).where(Property.slug == slug)
        if ignore_id:
            query = query.where(Property.id != ignore_id)
        if ctx.db.scalars(query.limit(1)).first() is None:
            return slug
    return f"{base}-{_base36(int(time.time() * 1000))}"


def _base36(n: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out or "0"


def form_initial(p: Property) -> dict:
    return {
        "title": p.title, "description": p.description, "listingType": p.listingType, "type": p.type, "status": p.status,
        "price": p.price, "priceUnit": p.priceUnit or "month", "beds": p.beds, "baths": p.baths, "areaSqft": p.areaSqft,
        "yearBuilt": "" if p.yearBuilt is None else p.yearBuilt, "furnishing": p.furnishing or "", "parking": p.parking,
        "floor": "" if p.floor is None else p.floor, "totalFloors": "" if p.totalFloors is None else p.totalFloors,
        "facing": p.facing or "", "address": p.address, "locality": p.locality, "city": p.city, "state": p.state or "",
        "postalCode": p.postalCode or "", "lat": p.lat, "lng": p.lng, "amenities": list(p.amenities or []),
        "images": [{"url": i.get("url"), "alt": i.get("alt") or ""} for i in p.images] if isinstance(p.images, list) else [],
        "videoUrl": p.videoUrl or "", "featured": p.featured, "listingBrokerId": p.listingBrokerId or "",
    }


def empty_initial(tenant) -> dict:
    return {
        "title": "", "description": "", "listingType": "SALE", "type": "APARTMENT", "status": "DRAFT", "price": "",
        "priceUnit": "month", "beds": 2, "baths": 2, "areaSqft": "", "yearBuilt": "", "furnishing": "", "parking": 1,
        "floor": "", "totalFloors": "", "facing": "", "address": "", "locality": "", "city": "", "state": "",
        "postalCode": "", "lat": tenant.mapLat, "lng": tenant.mapLng, "amenities": [], "images": [], "videoUrl": "",
        "featured": False, "listingBrokerId": "",
    }


def _page_number(raw: str | None) -> int:
    n = js_number(raw) if raw is not None else 0
    return max(1, int(n)) if math.isfinite(n) and n else 1


@router.get("")
def list_properties(q: str | None = None, search: str | None = None, status: str | None = None, page: str | None = None, ctx: AdminCtx = Depends(staff_only)):
    db = ctx.db
    status = status if status in PROPERTY_STATUSES else None
    term = (q if q is not None else search or "").strip()[:80]
    page_no = _page_number(page)

    filters = []
    if status:
        filters.append(Property.status == status)
    if term:
        filters.append(Property.title.icontains(term, autoescape=True) | Property.locality.icontains(term, autoescape=True) | Property.city.icontains(term, autoescape=True))

    properties = db.scalars(
        select(Property).where(*filters).order_by(Property.updatedAt.desc(), Property.id.asc()).offset((page_no - 1) * PAGE).limit(PAGE)
    ).all()
    total = db.scalar(select(func.count(Property.id)).where(*filters)) or 0
    counts = {s: n for s, n in db.execute(select(Property.status, func.count(Property.id)).group_by(Property.status)).all()}
    all_count = sum(counts.values())

    ids = [p.id for p in properties]
    leads = dict(db.execute(select(Lead.propertyId, func.count(Lead.id)).where(Lead.propertyId.in_(ids)).group_by(Lead.propertyId)).all()) if ids else {}
    tours = dict(db.execute(select(Tour.propertyId, func.count(Tour.id)).where(Tour.propertyId.in_(ids)).group_by(Tour.propertyId)).all()) if ids else {}
    broker_ids = {p.listingBrokerId for p in properties if p.listingBrokerId}
    names = dict(db.execute(select(Broker.id, Broker.name).where(Broker.id.in_(broker_ids))).all()) if broker_ids else {}

    rows = [
        ser(
            p,
            _count={"leads": leads.get(p.id, 0), "tours": tours.get(p.id, 0)},
            listingBroker={"name": names[p.listingBrokerId]} if p.listingBrokerId in names else None,
        )
        for p in properties
    ]
    cap = cap_of(ctx)
    return {
        "rows": rows,
        "total": total,
        "page": page_no,
        "pages": math.ceil(total / PAGE),
        "pageSize": PAGE,
        "counts": counts,
        "all": all_count,
        "cap": cap if math.isfinite(cap) else None,
        "atCap": math.isfinite(cap) and all_count >= cap,
        "plan": ctx.tenant.plan,
        "q": term,
        "status": status,
    }


@router.get("/new")
def new_property_meta(ctx: AdminCtx = Depends(staff_only)):
    cap = cap_of(ctx)
    count = property_count(ctx)
    return {
        "atCap": math.isfinite(cap) and count >= cap,
        "cap": cap if math.isfinite(cap) else None,
        "count": count,
        "brokers": broker_options(ctx),
        "initial": empty_initial(ctx.tenant),
        "tenant": tenant_map_json(ctx.tenant),
    }


@router.get("/{id}")
def get_property(id: str, ctx: AdminCtx = Depends(staff_only)):
    p = find_property(ctx, id)
    if p is None:
        raise NotFound("Property not found")
    tours = ctx.db.execute(select(Tour.id, Tour.title, Tour.published).where(Tour.propertyId == id)).all()
    return {
        "property": ser(p),
        "initial": form_initial(p),
        "brokers": broker_options(ctx),
        "tours": [{"id": t.id, "title": t.title, "published": t.published} for t in tours],
        "tenant": tenant_map_json(ctx.tenant),
        "features": features_json(ctx.tenant),
    }


def _check_listing_broker(ctx: AdminCtx, broker_id: str | None) -> None:
    if broker_id and ctx.db.scalars(select(Broker.id).where(Broker.id == broker_id)).first() is None:
        raise UserError("Listing agent not found")


@router.post("")
def create_property(body: Any = Body(default=None), ctx: AdminCtx = Depends(staff_only)):
    data = parse_property_input(body)
    _check_listing_broker(ctx, data["listingBrokerId"])

    cap = cap_of(ctx)
    if math.isfinite(cap) and property_count(ctx) >= cap:
        raise UserError(f"Your {ctx.tenant.plan.lower()} plan allows {int(cap)} listings. Upgrade to add more.")

    created = Property(**data, slug=unique_slug(ctx, data["title"]))
    ctx.db.add(created)
    ctx.db.commit()
    return {"ok": True, "id": created.id}


@router.put("/{id}")
def update_property(id: str, body: Any = Body(default=None), ctx: AdminCtx = Depends(staff_only)):
    data = parse_property_input(body)
    _check_listing_broker(ctx, data["listingBrokerId"])

    existing = find_property(ctx, id)
    if existing is None:
        raise UserError("Property not found")
    slug = existing.slug if existing.title == data["title"] else unique_slug(ctx, data["title"], id)
    for key, value in {**data, "slug": slug}.items():
        setattr(existing, key, value)
    ctx.db.commit()
    return {"ok": True, "id": id}


@router.delete("/{id}")
def delete_property(id: str, ctx: AdminCtx = Depends(staff_only)):
    found = find_property(ctx, id)
    if found is None:
        raise UserError("Property not found")
    ctx.db.delete(found)
    ctx.db.commit()
    return {"ok": True}


def _body_field(body: Any, key: str) -> Any:
    return body.get(key) if isinstance(body, dict) else None


@router.post("/{id}/status")
def set_property_status(id: str, body: Any = Body(default=None), ctx: AdminCtx = Depends(staff_only)):
    status = _body_field(body, "status")
    if not isinstance(status, str) or status not in PROPERTY_STATUSES:
        raise UserError("Unknown status")
    found = find_property(ctx, id)
    if found is None:
        raise UserError("Property not found")
    found.status = status
    ctx.db.commit()
    return {"ok": True}


@router.post("/{id}/featured")
def toggle_featured(id: str, body: Any = Body(default=None), ctx: AdminCtx = Depends(staff_only)):
    found = find_property(ctx, id)
    if found is None:
        raise UserError("Property not found")
    found.featured = js_truthy(_body_field(body, "featured"))
    ctx.db.commit()
    return {"ok": True}
