"""Admin: one-shot setup import from a .zip (branding, team and listings with their photos in one upload).

POST /api/admin/import/zip        multipart field "file" = the .zip
    Staff only (OWNER / ADMIN / SUPER). Needs a plan with `csvImport`, except for SUPER, whose settings.json may also
    set "plan" (applied first, so one upload can upgrade a demo client and fill it). Recognised entries, at the zip root
    or inside one top-level folder:
      settings.json      any keys of PUT /api/admin/settings (merged over the current values) and, SUPER only, "plan"
      logo.(png|jpg|jpeg|webp)   site logo        hero/*   up to 6 hero images (replace the current ones)
      team.csv           one team member per row; photos named in its "Photo file" column, looked up anywhere in the zip
      properties.csv     same columns as the CSV import, plus optional "featured" (yes/no) and "agent email"
      photos/<NN - title>/*   photos for row NN of properties.csv (a folder named after the title also matches);
                              a "photo files" column (names separated by | or ;) works too
    Steps run in that order. Bad rows are reported and skipped; they never stop the rest.
    -> {"ok": true, "plan": {...} | null, "settings": {...} | null, "team": {...} | null, "properties": {...} | null,
        "warnings": [str]}

GET /api/admin/import/zip-template
    A small example zip with every file above, to download and fill in.
"""

import csv
import io
import json
import logging
import re
import zipfile
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.deps import STAFF, AdminCtx, authed
from app.errors import PlanLocked, UserError
from app.import_csv import TEMPLATE_CSV, auto_map, build_row
from app.models import Broker, User
from app.constants import PLANS
from app.plans import can, plan_of
from app.routers.admin_brokers import create_broker_record
from app.routers.admin_import import _import_row, _remaining
from app.routers.admin_settings import apply_settings, settings_initial
from app.storage import process_image, store_image

log = logging.getLogger("import.zip")
router = APIRouter(prefix="/api/admin/import")

MAX_ZIP_BYTES = 200 * 1024 * 1024
MAX_UNZIPPED_BYTES = 600 * 1024 * 1024
MAX_ENTRIES = 3000
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_ROWS = 500
MAX_PHOTOS_PER_LISTING = 12
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}

TEAM_COLUMNS = {
    "name": ["full name", "name"],
    "title": ["job title", "title", "designation"],
    "email": ["email their login", "email", "login email"],
    "phone": ["phone whatsapp", "phone", "whatsapp", "mobile"],
    "bio": ["short bio", "bio", "about"],
    "languages": ["languages spoken", "languages"],
    "areas": ["areas localities served", "areas", "localities"],
    "specialties": ["specialties", "specialities"],
    "role": ["role"],
    "password": ["password"],
    "photo": ["photo file", "photo", "photo filename"],
}


def _norm(s) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _split(v) -> list[str]:
    return [x.strip() for x in re.split(r"[;|,\n]", str(v or "")) if x.strip()]


def _truthy(v) -> bool:
    return _norm(v) in ("yes", "y", "true", "1", "featured")


class Bundle:
    """Safe, read-only view of the uploaded zip: no extraction to disk, bounded sizes, junk and unsafe paths ignored."""

    def __init__(self, data: bytes):
        try:
            self.zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as err:
            raise UserError("That file is not a valid .zip") from err
        infos = [i for i in self.zf.infolist() if not i.is_dir()]
        if len(infos) > MAX_ENTRIES:
            raise UserError(f"The zip has more than {MAX_ENTRIES} files")
        if sum(i.file_size for i in infos) > MAX_UNZIPPED_BYTES:
            raise UserError("The zip is too large once unpacked (600 MB max)")
        files = {}
        for info in infos:
            parts = PurePosixPath(info.filename.replace("\\", "/")).parts
            if not parts or ".." in parts or parts[0] == "__MACOSX" or any(p.startswith(".") for p in parts):
                continue
            files["/".join(parts)] = info
        # Allow everything to sit inside one top-level folder (the usual "Compress folder" result).
        tops = {k.split("/")[0] for k in files}
        if len(tops) == 1 and all("/" in k for k in files):
            files = {k.split("/", 1)[1]: v for k, v in files.items()}
        self.files = files

    def find(self, name: str) -> str | None:
        """Root-level file by case-insensitive name."""
        return next((k for k in self.files if "/" not in k and k.lower() == name.lower()), None)

    def read(self, path: str, limit: int = MAX_IMAGE_BYTES) -> bytes:
        info = self.files[path]
        if info.file_size > limit:
            raise UserError(f"{PurePosixPath(path).name} is too large")
        return self.zf.read(info)

    def text(self, path: str) -> str:
        raw = self.read(path, 20 * 1024 * 1024)
        for enc in ("utf-8-sig", "cp1252"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError:
                continue
        raise UserError(f"{path} is not a readable text file")

    def csv_rows(self, path: str) -> list[dict]:
        rows = list(csv.DictReader(io.StringIO(self.text(path))))
        rows = [r for r in rows if any((v or "").strip() for v in r.values() if isinstance(v, str))]
        if len(rows) > MAX_ROWS:
            raise UserError(f"{path} has more than {MAX_ROWS} rows")
        return rows

    def images_in(self, folder: str) -> list[str]:
        prefix = folder.rstrip("/") + "/"
        return sorted(k for k in self.files if k.startswith(prefix) and PurePosixPath(k).suffix.lower() in IMAGE_EXT)

    def by_basename(self, name: str) -> str | None:
        target = PurePosixPath(name.strip()).name.lower()
        return next((k for k in self.files if PurePosixPath(k).name.lower() == target), None)

    def subfolders(self, folder: str) -> list[str]:
        prefix = folder.rstrip("/") + "/"
        return sorted({k[len(prefix):].split("/")[0] for k in self.files if k.startswith(prefix) and "/" in k[len(prefix):]})


def _store(bundle: Bundle, path: str, tenant_id: str, kind: str = "photo") -> str:
    processed = process_image(bundle.read(path), kind)
    folder = "photos" if kind == "photo" else kind
    return store_image(processed["buffer"], processed["ext"], tenant_id, folder)["url"]


def _apply_plan(ctx: AdminCtx, wanted, warnings: list[str]) -> dict | None:
    if wanted in (None, ""):
        return None
    wanted = str(wanted).upper()
    if ctx.user.role != "SUPER":
        warnings.append("settings.json asked for a plan change; only WebInOrbit can change plans, so it was ignored.")
        return {"changed": False, "plan": ctx.tenant.plan}
    if wanted not in PLANS:
        warnings.append(f'Unknown plan "{wanted}" in settings.json (use STARTER, PRO or ENTERPRISE).')
        return {"changed": False, "plan": ctx.tenant.plan}
    changed = ctx.tenant.plan != wanted
    ctx.tenant.plan = wanted
    ctx.db.commit()
    ctx.features = plan_of(ctx.tenant)
    return {"changed": changed, "plan": wanted}


def _apply_settings(ctx: AdminCtx, bundle: Bundle, overrides: dict, warnings: list[str]) -> dict | None:
    logo = next((bundle.find(f"logo{ext}") for ext in (".png", ".jpg", ".jpeg", ".webp") if bundle.find(f"logo{ext}")), None)
    hero = bundle.images_in("hero")[:6]
    if not overrides and not logo and not hero:
        return None

    body = settings_initial(ctx.tenant)
    body["heroImages"] = [h["url"] for h in body["heroImages"]]
    body.update({k: v for k, v in overrides.items() if k in body})
    unknown = sorted(k for k in overrides if k not in body)
    if unknown:
        warnings.append(f"settings.json: ignored unknown keys {', '.join(unknown)}")

    tenant_id = ctx.tenant.id
    if logo:
        try:
            body["logoUrl"] = _store(bundle, logo, tenant_id, "logo")
        except UserError as err:
            warnings.append(f"Logo skipped: {err.message}")
    stored_hero = []
    for path in hero:
        try:
            stored_hero.append(_store(bundle, path, tenant_id))
        except UserError as err:
            warnings.append(f"Hero image {PurePosixPath(path).name} skipped: {err.message}")
    if stored_hero:
        body["heroImages"] = stored_hero

    try:
        apply_settings(ctx, body)
    except UserError as err:
        ctx.db.rollback()
        return {"updated": False, "error": err.message}
    return {"updated": True, "logo": bool(logo and body.get("logoUrl")), "heroImages": len(stored_hero)}


def _team_row(raw: dict) -> dict:
    by_norm = {_norm(k): v for k, v in raw.items() if k}
    out = {}
    for key, aliases in TEAM_COLUMNS.items():
        out[key] = next(((by_norm.get(a) or "").strip() for a in aliases if (by_norm.get(a) or "").strip()), "")
    return out


def _import_team(ctx: AdminCtx, bundle: Bundle, path: str) -> dict:
    created, skipped, logins = 0, [], []
    tenant_id = ctx.tenant.id
    for i, raw in enumerate(bundle.csv_rows(path), start=1):
        row = _team_row(raw)
        label = row["name"] or f"Row {i}"
        try:
            if ctx.db.scalars(select(User.id).where(User.tenantId == tenant_id, User.email == row["email"].lower())).first():
                raise UserError("Already on the team (same email)")
            photo_url = ""
            if row["photo"]:
                found = bundle.by_basename(row["photo"])
                if found:
                    photo_url = _store(bundle, found, tenant_id)
            role = row["role"].upper() if row["role"].upper() in ("BROKER", "ADMIN") else "BROKER"
            res = create_broker_record(ctx, {
                "name": row["name"], "email": row["email"], "phone": row["phone"], "title": row["title"], "bio": row["bio"],
                "photoUrl": photo_url, "role": role, "languages": _split(row["languages"]) or ["English"],
                "specialties": _split(row["specialties"]), "areas": _split(row["areas"]), "capacity": 15, "weight": 1,
                "password": row["password"],
            })
            created += 1
            if res.get("tempPassword"):
                logins.append({"name": row["name"], "email": row["email"].lower(), "tempPassword": res["tempPassword"]})
        except UserError as err:
            ctx.db.rollback()
            skipped.append({"row": i, "name": label, "error": err.message})
    return {"created": created, "skipped": skipped, "logins": logins}


def _photo_folder(bundle: Bundle, index: int, title: str) -> str | None:
    folders = bundle.subfolders("photos")
    want = _norm(title)
    for f in folders:
        m = re.match(r"^\s*0*(\d+)\b", f)
        if m and int(m.group(1)) == index:
            return f"photos/{f}"
    return next((f"photos/{f}" for f in folders if _norm(re.sub(r"^\s*\d+\s*[-_.]?\s*", "", f)) == want), None)


def _import_properties(ctx: AdminCtx, bundle: Bundle, path: str) -> dict:
    rows = bundle.csv_rows(path)
    if not rows:
        return {"created": 0, "failed": [], "photos": 0}
    headers = list(rows[0].keys())
    mapping = auto_map(headers)
    norm_headers = {_norm(h): h for h in headers if h}
    featured_col = norm_headers.get("featured")
    agent_col = next((norm_headers[a] for a in ("agent email", "listing agent", "broker email", "agent") if a in norm_headers), None)
    files_col = next((norm_headers[a] for a in ("photo files", "photos files", "image files") if a in norm_headers), None)
    brokers = {b.email.lower(): b.id for b in ctx.db.scalars(select(Broker)) if b.email}

    tenant_id, contact_email = ctx.tenant.id, ctx.tenant.contactEmail
    room, geocoded = _remaining(ctx), False
    created, failed, photo_count = 0, [], 0
    for i, raw in enumerate(rows, start=1):
        row = build_row(raw, mapping)
        if featured_col:
            row["featured"] = _truthy(raw.get(featured_col))
        if agent_col and (raw.get(agent_col) or "").strip().lower() in brokers:
            row["listingBrokerId"] = brokers[raw[agent_col].strip().lower()]

        paths = []
        if files_col and raw.get(files_col):
            paths = [p for p in (bundle.by_basename(n) for n in _split(raw[files_col])) if p]
        if not paths:
            folder = _photo_folder(bundle, i, row.get("title") or "")
            paths = bundle.images_in(folder) if folder else []
        stored = []
        for p in paths[:MAX_PHOTOS_PER_LISTING]:
            try:
                stored.append(_store(bundle, p, tenant_id))
            except UserError:
                pass

        row["__index"] = i
        result, room, geocoded = _import_row(ctx, row, room, geocoded, tenant_id, contact_email, stored)
        if result["ok"]:
            created += 1
            photo_count += len(stored)
        else:
            failed.append({"row": i, "title": row.get("title") or "", "error": result["error"]})
    return {"created": created, "failed": failed, "photos": photo_count}


@router.post("/zip")
def import_zip(file: UploadFile = File(...), ctx: AdminCtx = Depends(authed(STAFF))):
    data = file.file.read(MAX_ZIP_BYTES + 1)
    if len(data) > MAX_ZIP_BYTES:
        raise UserError("The zip is larger than 200 MB")
    bundle = Bundle(data)

    warnings: list[str] = []
    overrides = {}
    settings_path = bundle.find("settings.json")
    if settings_path:
        try:
            overrides = json.loads(bundle.text(settings_path))
            if not isinstance(overrides, dict):
                raise ValueError
        except (ValueError, UserError):
            raise UserError("settings.json is not valid JSON (it should be one { ... } object)") from None

    plan = _apply_plan(ctx, overrides.pop("plan", None), warnings)
    if not can(ctx.tenant, "csvImport") and ctx.user.role != "SUPER":
        raise PlanLocked("csvImport")

    team_path, props_path = bundle.find("team.csv"), bundle.find("properties.csv")
    if not (overrides or team_path or props_path or bundle.find("logo.png") or bundle.images_in("hero")):
        raise UserError("Nothing to import. Add settings.json, team.csv or properties.csv to the zip.")

    settings = _apply_settings(ctx, bundle, overrides, warnings)
    team = _import_team(ctx, bundle, team_path) if team_path else None
    properties = _import_properties(ctx, bundle, props_path) if props_path else None
    return {"ok": True, "plan": plan, "settings": settings, "team": team, "properties": properties, "warnings": warnings}


TEMPLATE_README = """ONE-ZIP SETUP
=============
Put these files in a folder, zip it, and upload it on Admin > Bulk import > "Import a full setup (.zip)".
Every file is optional. Rows with mistakes are skipped and listed after the import.

settings.json     Branding & settings. Use the same names as the settings form (see the example).
                  "plan": "PRO" / "ENTERPRISE" only works when a WebInOrbit super admin uploads it.
logo.png          Your logo (optional; without it the site shows the brand icon + name).
hero/             Up to 6 wide photos for the home page banner.
team.csv          One team member per row. Put their photos anywhere in the zip and name the file in "Photo file".
                  Without a password a temporary one is created and shown once after the import.
properties.csv    Same columns as the CSV import. Extra columns: "featured" (yes/no) and "agent email"
                  (a team member's email, to assign the listing).
photos/           One folder per listing named "01 - Title", "02 - Title"... (number = row in properties.csv).
                  JPG, PNG or WebP, up to 12 per listing.
"""

TEMPLATE_SETTINGS = {
    "name": "Your Agency",
    "tagline": "Find a home you will love",
    "about": "A short paragraph about your agency.",
    "contactEmail": "hello@youragency.com",
    "contactPhone": "+91 98765 43210",
    "whatsapp": "+919876543210",
    "address": "Office address, City",
    "primaryColor": "#0f3d3e",
    "accentColor": "#d4a64a",
    "currency": "INR",
    "mapLat": 22.5,
    "mapLng": 79.0,
    "mapZoom": 4.5,
}

TEMPLATE_TEAM = (
    "Full name,Job title,Email (their login),Phone / WhatsApp,Languages spoken,Areas / localities served,Specialties,Short bio,Photo file\n"
    '"Asha Verma","Senior Advisor","asha@youragency.com","+91 98765 43210","English; Hindi","Bandra West; Powai","Luxury homes",'
    '"Ten years helping families find homes in Mumbai.","asha.jpg"\n'
)


@router.get("/zip-template")
def zip_template(ctx: AdminCtx = Depends(authed(STAFF))):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("setup/README.txt", TEMPLATE_README)
        z.writestr("setup/settings.json", json.dumps(TEMPLATE_SETTINGS, indent=2))
        z.writestr("setup/team.csv", TEMPLATE_TEAM)
        z.writestr("setup/properties.csv", TEMPLATE_CSV.replace("status\n", "status,featured,agent email\n").replace('"active"\n', '"active","yes","asha@youragency.com"\n'))
        z.writestr("setup/hero/", "")
        z.writestr("setup/photos/01 - Sea-view 3 BHK in Bandra/", "")
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="setup-template.zip"'})
