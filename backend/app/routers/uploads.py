import re

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from app.config import env
from app.deps import STAFF, authed
from app.errors import UserError
from app.rate_limit import rate_limit
from app.routing.service import process_sla_breaches_locked
from app.storage import KINDS, mime_for, panorama_thumb, process_image, read_local, store_image

router = APIRouter()

MAX_BYTES = 25 * 1024 * 1024
ALLOWED = re.compile(r"^image/(jpeg|png|webp|avif|gif)$")
SEGMENT = re.compile(r"^[\w.-]+$")


@router.post("/api/uploads")
def upload(files: list[UploadFile] = File(default=[], alias="file"), kind: str = Form("photo"), ctx=Depends(authed(STAFF))):
    tenant_id = ctx.tenant.id
    if not rate_limit(f"upload:{tenant_id}", 120, 60)["ok"]:
        raise UserError("Too many uploads, slow down a little", status=429)
    if not files:
        raise UserError("No file received", status=400)
    kind = kind if kind in KINDS else "photo"

    results = []
    for f in files[:20]:
        name = f.filename or "image"
        if not ALLOWED.match(f.content_type or ""):
            results.append({"name": name, "error": "Only JPG, PNG, WebP, AVIF or GIF images are supported"})
            continue
        data = f.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            results.append({"name": name, "error": "Image is larger than 25 MB"})
            continue
        try:
            processed = process_image(data, kind)
            folder = "panos" if kind == "panorama" else "photos" if kind == "photo" else kind
            stored = store_image(processed["buffer"], processed["ext"], tenant_id, folder)
            thumb_url = None
            if kind == "panorama":
                thumb = panorama_thumb(processed["buffer"])
                thumb_url = store_image(thumb["buffer"], thumb["ext"], tenant_id, "thumbs")["url"]
            results.append({"name": name, "url": stored["url"], "thumbUrl": thumb_url, "width": processed["width"], "height": processed["height"]})
        except UserError as err:
            results.append({"name": name, "error": err.message})
        except Exception:  # noqa: BLE001
            results.append({"name": name, "error": "Could not process this image"})
    return {"files": results}


@router.get("/uploads/{path:path}")
def serve_upload(path: str):
    segments = path.split("/")
    if not all(SEGMENT.match(s) and s != ".." for s in segments):
        return Response("Not found", status_code=404)
    data = read_local(segments)
    if data is None:
        return Response("Not found", status_code=404)
    return Response(
        data,
        media_type=mime_for(segments[-1]),
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )


@router.api_route("/api/cron/sla", methods=["GET", "POST"])
def cron_sla(request: Request):
    secret = env("CRON_SECRET")
    if not secret or request.headers.get("authorization") != f"Bearer {secret}":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    summary = process_sla_breaches_locked()
    return {"ok": True, **(summary or {"skipped": True})}
