"""Admin: CSV bulk import. Port of src/app/admin/(panel)/import/* and src/lib/import.js.

Requires a signed-in OWNER / ADMIN (or SUPER) on a plan that includes `csvImport`:
anonymous -> 401, BROKER -> 403 {"code": "forbidden"}, plan without the feature -> 403
{"error", "code": "plan_locked", "feature": "csvImport"} (the old page redirected to /admin/plan?locked=csvImport).
The CSV itself is parsed in the browser (papaparse); the server receives already-built rows (see build_row).

GET  /api/admin/import
       Data of the import page. -> {"remaining": int | null (null = unlimited), "cap": int | null, "count": int,
         "fields": [{"key", "label", "required"?, "aliases": [str]}], "templateCsv": str}

POST /api/admin/import/preview
       Optional server-side equivalent of the wizard's autoMap/buildRow/checkRow (the wizard may keep using its JS copy).
       Body: {"headers"?: [str], "rows": [ {csvHeader: cell} ] (max 2000), "mapping"?: {fieldKey: csvHeader}}
       `mapping` defaults to the auto-detected mapping of `headers` (or of the keys of the first row).
       -> {"mapping": {...}, "rows": [{"row": <built property payload>, "check": {"ok": bool, "error"?: str, "needsGeocode": bool}}]}

POST /api/admin/import/batch          (importBatch)
       Body: [row, ...] (a bare JSON array, as the action took) or {"rows": [row, ...]}; at most 12 rows, else 400
       "Batch too large". A row is a built property payload (see GET fields / preview) plus an optional "__index"
       echoed back in the result. Rows without lat/lng are geocoded with Nominatim (env NOMINATIM_URL, default
       https://nominatim.openstreetmap.org; 1.1 s pause between geocoded rows of one batch). Up to 6 image URLs per row
       are downloaded and re-hosted (a broken photo never blocks the listing). Rows are created one by one; the plan's
       maxListings cap is honoured ("Listing limit reached for your plan").
       -> {"ok": true, "results": [{"index": <__index>, "ok": true} | {"index": <__index>, "ok": false, "error": str}]}
"""

import logging
import math
import time
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select

from app.config import env
from app.deps import AdminCtx, authed, STAFF
from app.errors import UserError
from app.fetch_image import import_remote_image
from app.import_csv import IMPORT_FIELDS, TEMPLATE_CSV, auto_map, build_row, check_row
from app.models import Property
from app.plans import limit_of
from app.property_schema import parse_property_input
from app.slug import slugify

log = logging.getLogger("import")
router = APIRouter(prefix="/api/admin/import")

import_staff = authed(STAFF, "csvImport")

MAX_BATCH = 12
MAX_ROWS = 2000
GEOCODE_PAUSE = 1.1
sleep = time.sleep


def nominatim_base() -> str:
    return env("NOMINATIM_URL") or "https://nominatim.openstreetmap.org"


def geocode(row: dict, contact_email: str | None) -> dict | None:
    q = ", ".join(str(row[k]) for k in ("address", "locality", "city", "state") if row.get(k))
    try:
        res = httpx.get(
            f"{nominatim_base()}/search",
            params={"q": q, "format": "jsonv2", "limit": "1"},
            headers={"User-Agent": f"WebInOrbit-RealEstate/1.0 ({contact_email or 'contact@webinorbit.com'})"},
            timeout=6,
        )
        hits = res.json() if res.is_success else []
        hit = hits[0] if hits else None
        return {"lat": float(hit["lat"]), "lng": float(hit["lon"])} if hit else None
    except Exception:
        return None


def _remaining(ctx: AdminCtx) -> float:
    cap = limit_of(ctx.tenant, "maxListings")
    if not math.isfinite(cap):
        return math.inf
    return cap - (ctx.db.scalar(select(func.count(Property.id))) or 0)


def _slug_for(ctx: AdminCtx, title: str) -> str:
    base = slugify(title) or "property"
    slug, i = base, 2
    while ctx.db.scalars(select(Property.id).where(Property.slug == slug).limit(1)).first() is not None:
        slug = f"{base}-{i}"
        i += 1
    return slug


@router.get("")
def import_page(ctx: AdminCtx = Depends(import_staff)):
    cap = limit_of(ctx.tenant, "maxListings")
    count = ctx.db.scalar(select(func.count(Property.id))) or 0
    finite = math.isfinite(cap)
    return {
        "remaining": max(0, int(cap) - count) if finite else None,
        "cap": int(cap) if finite else None,
        "count": count,
        "fields": IMPORT_FIELDS,
        "templateCsv": TEMPLATE_CSV,
    }


@router.post("/preview")
def preview(body: Any = Body(default=None), ctx: AdminCtx = Depends(import_staff)):
    if not isinstance(body, dict) or not isinstance(body.get("rows"), list):
        raise UserError("Provide the CSV rows")
    rows = body["rows"]
    if len(rows) > MAX_ROWS:
        raise UserError("Please split files into 2,000 rows or fewer")
    rows = [r if isinstance(r, dict) else {} for r in rows]

    mapping = body.get("mapping")
    if not isinstance(mapping, dict):
        headers = body.get("headers")
        if not isinstance(headers, list):
            headers = list(rows[0].keys()) if rows else []
        mapping = auto_map([str(h) for h in headers])

    built = [build_row(r, mapping) for r in rows]
    return {"mapping": mapping, "rows": [{"row": b, "check": check_row(b)} for b in built]}


def _import_row(ctx: AdminCtx, raw: Any, room: float, geocoded: bool, tenant_id: str, contact_email: str | None) -> tuple[dict, float, bool]:
    index = raw.get("__index") if isinstance(raw, dict) else None
    try:
        if not isinstance(raw, dict):
            raise UserError("Invalid row")
        row = {k: v for k, v in raw.items() if k != "__index"}
        if room <= 0:
            raise UserError("Listing limit reached for your plan")
        check = check_row(row)
        if not check["ok"]:
            raise UserError(check["error"])
        if check["needsGeocode"]:
            if geocoded:
                sleep(GEOCODE_PAUSE)
            geocoded = True
            pos = geocode(row, contact_email)
            if not pos:
                raise UserError("Could not find coordinates for this address. Add latitude and longitude.")
            row.update(pos)

        images = []
        for img in (row.get("images") if isinstance(row.get("images"), list) else [])[:6]:
            try:
                images.append({"url": import_remote_image(img["url"], tenant_id), "alt": ""})
            except Exception:
                pass

        data = parse_property_input({**row, "images": images})
        ctx.db.add(Property(**data, slug=_slug_for(ctx, data["title"])))
        ctx.db.commit()
        return {"index": index, "ok": True}, room - 1, geocoded
    except UserError as err:
        ctx.db.rollback()
        return {"index": index, "ok": False, "error": err.message}, room, geocoded
    except Exception:
        ctx.db.rollback()
        log.exception("Import row failed")
        return {"index": index, "ok": False, "error": "Something went wrong"}, room, geocoded


@router.post("/batch")
def import_batch(body: Any = Body(default=None), ctx: AdminCtx = Depends(import_staff)):
    rows = body.get("rows") if isinstance(body, dict) else body
    if not isinstance(rows, list) or len(rows) > MAX_BATCH:
        raise UserError("Batch too large")

    tenant_id, contact_email = ctx.tenant.id, ctx.tenant.contactEmail
    room = _remaining(ctx)
    geocoded = False
    results = []
    for raw in rows:
        result, room, geocoded = _import_row(ctx, raw, room, geocoded, tenant_id, contact_email)
        results.append(result)
    return {"ok": True, "results": results}
