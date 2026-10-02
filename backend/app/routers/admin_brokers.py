"""Admin team (brokers). Every endpoint is staff only (OWNER/ADMIN/SUPER); others get 403.

Broker objects carry every Broker column under its DB name (id, userId, name, email, phone, photoUrl, title, bio, languages,
specialties, areas, territory, capacity, weight, active, timezone, workingHours, lastAssignedAt, createdAt). Dates are ISO-8601.

GET /api/admin/brokers
    Response: {
      brokers: [{...Broker, load: open leads, won: won leads, onShift: bool (active and inside working hours now), self: bool}]
               (active first, then by name),
      count, maxBrokers: int|null (null = unlimited), atCap: bool
    }

GET /api/admin/brokers/new
    Response: {initial: {...form defaults}, mapCenter: [lng, lat], atCap, maxBrokers}
    When atCap the old page redirected to /admin/plan?locked=maxBrokers; saving would fail with the seat-limit error.

GET /api/admin/brokers/{id}
    Response: {id, broker: {...Broker}, initial: {...form values}, mapCenter: [lng, lat], isSelf: bool,
               lockedRole: "Owner"|null}. 404 when the team member does not exist.

POST /api/admin/brokers            body = the broker form object (saveBroker(null, input))
PUT  /api/admin/brokers/{id}       body = the broker form object (saveBroker(id, input))
    Body: {name (2-80), email, phone?, title?, bio? (<=600), photoUrl?, role: "BROKER"|"ADMIN" (default BROKER),
           languages: [str] (filtered to the supported languages), specialties: [str], areas: [str], capacity: 1-500,
           weight: 1-10, timezone: str (default "Asia/Kolkata"),
           workingHours: null | {mon..sun: null | ["HH:MM", "HH:MM"]} (open must be before close),
           territory: null | GeoJSON Polygon, active: bool (default true), password?: str (<=100)}
    Create response: {ok: true, id, tempPassword: str|null}; tempPassword is set only when the server generated the
    password (shown once). Also creates the broker's login User. Update response: {ok: true, id}; keeps the linked User's
    email/name/role/password in sync (OWNER/SUPER roles are never changed).
    Errors (400): validation messages, "Your plan allows N broker seats. Upgrade to add more.",
    "A user with this email already exists", "Another user already uses this email", "Team member not found",
    "Password must be at least 8 characters".

POST /api/admin/brokers/{id}/active   body {active: bool}   -> {ok: true}
DELETE /api/admin/brokers/{id}                              -> {ok: true, orphaned: <open leads left unassigned>}
    Errors: "Team member not found", "You cannot remove your own account", "The account owner cannot be removed".
    Removes the broker's login User too.
"""

import math
import re
import secrets

from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, func, null, select
from sqlalchemy.exc import IntegrityError

from app.constants import DAYS, LANGUAGES, OPEN_STATUSES
from app.deps import AdminCtx, staff_only
from app.errors import NotFound, UserError
from app.models import Broker, Lead, User
from app.plans import limit_of
from app.routing.engine import is_broker_available
from app.security import hash_password
from app.serialize import ser
from app.validate import choice, email, number, req_text, str_list

router = APIRouter(prefix="/api/admin/brokers")

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DEFAULT_WORKING_HOURS = {
    "mon": ["09:00", "19:00"], "tue": ["09:00", "19:00"], "wed": ["09:00", "19:00"], "thu": ["09:00", "19:00"],
    "fri": ["09:00", "19:00"], "sat": ["10:00", "17:00"], "sun": None,
}
KEEP_ROLES = ("OWNER", "SUPER")


def _opt(v, max_len: int, label: str) -> str | None:
    if v is None or v == "":
        return None
    s = str(v).strip()
    if len(s) > max_len:
        raise UserError(f"{label} must be {max_len} characters or fewer")
    return s


def _working_hours(v) -> dict | None:
    if v is None:
        return None
    if not isinstance(v, dict):
        raise UserError("Invalid working hours")
    out: dict = {}
    for day, slot in v.items():
        if slot is None:
            out[day] = None
            continue
        if not isinstance(slot, (list, tuple)) or len(slot) != 2 or not all(isinstance(t, str) and TIME_RE.match(t) for t in slot):
            raise UserError("Working hours must be HH:MM times")
        out[day] = list(slot)
    if any(day not in DAYS for day in out):
        raise UserError("Invalid working hours")
    if any(slot and not slot[0] < slot[1] for slot in out.values()):
        raise UserError("Opening time must be before closing time")
    return out


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _territory(v):
    if v in (None, False, 0, ""):
        return None
    ring = v["coordinates"][0] if isinstance(v, dict) and v.get("type") == "Polygon" and isinstance(v.get("coordinates"), list) and v["coordinates"] else None
    if not isinstance(ring, list) or len(ring) < 4 or not all(isinstance(p, list) and len(p) == 2 and all(_finite(c) for c in p) for p in ring):
        raise UserError("Territory must be a polygon with at least three points")
    return v


def parse_broker(body: dict) -> dict:
    d = {
        "name": req_text(body.get("name"), "Name", 2, 80, message="Name is required"),
        "email": email(str(body.get("email") or "").lower(), "Enter a valid email"),
        "phone": _opt(body.get("phone"), 30, "Phone"),
        "title": _opt(body.get("title"), 80, "Title"),
        "bio": _opt(body.get("bio"), 600, "Bio"),
        "photoUrl": _opt(body.get("photoUrl"), 600, "Photo URL"),
        "role": choice(body.get("role"), ("BROKER", "ADMIN"), "Role", default="BROKER"),
        "languages": str_list(body.get("languages"), 30, 60, allowed=LANGUAGES, label="Languages"),
        "specialties": str_list(body.get("specialties"), 30, 60, label="Specialties"),
        "areas": str_list(body.get("areas"), 30, 60, label="Areas"),
        "capacity": number(body.get("capacity"), "Capacity", 1, 500, integer=True),
        "weight": number(body.get("weight"), "Weight", 1, 10, integer=True),
    }
    tz = body.get("timezone")
    if tz is None:
        tz = "Asia/Kolkata"
    if not isinstance(tz, str) or len(tz) > 60:
        raise UserError("Time zone is not valid")
    d["timezone"] = tz
    d["workingHours"] = _working_hours(body.get("workingHours"))
    d["territory"] = _territory(body.get("territory"))
    active = body.get("active")
    if active is not None and not isinstance(active, bool):
        raise UserError("Active must be true or false")
    d["active"] = True if active is None else active
    password = body.get("password")
    if password is None:
        password = ""
    if not isinstance(password, str):
        raise UserError("Password must be text")
    if len(password) > 100:
        raise UserError("Password must be 100 characters or fewer")
    d["password"] = password
    return d


def _json_or_null(v):
    return null() if v is None else v


def _broker(ctx: AdminCtx, broker_id: str) -> Broker:
    broker = ctx.db.scalars(select(Broker).where(Broker.id == broker_id)).first()
    if not broker:
        raise UserError("Team member not found")
    return broker


def _seat_cap(ctx: AdminCtx) -> int | None:
    cap = limit_of(ctx.tenant, "maxBrokers")
    return int(cap) if math.isfinite(cap) else None


def _count(ctx: AdminCtx) -> int:
    return ctx.db.scalar(select(func.count(Broker.id))) or 0


def _map_center(ctx: AdminCtx) -> list[float]:
    return [ctx.tenant.mapLng, ctx.tenant.mapLat]


def _group_counts(ctx: AdminCtx, *where) -> dict:
    return dict(ctx.db.execute(select(Lead.brokerId, func.count(Lead.id)).where(*where, Lead.brokerId.is_not(None)).group_by(Lead.brokerId)).all())


@router.get("")
def list_brokers(ctx: AdminCtx = Depends(staff_only)):
    brokers = ctx.db.scalars(select(Broker).order_by(Broker.active.desc(), Broker.name.asc())).all()
    loads = _group_counts(ctx, Lead.status.in_(OPEN_STATUSES))
    won = _group_counts(ctx, Lead.status == "WON")
    cap = _seat_cap(ctx)
    return {
        "brokers": [
            ser(
                b,
                load=loads.get(b.id, 0),
                won=won.get(b.id, 0),
                onShift=bool(b.active and is_broker_available({"workingHours": b.workingHours, "timezone": b.timezone})),
                self=b.userId is not None and b.userId == ctx.user.id,
            )
            for b in brokers
        ],
        "count": len(brokers),
        "maxBrokers": cap,
        "atCap": cap is not None and len(brokers) >= cap,
    }


@router.get("/new")
def new_broker_defaults(ctx: AdminCtx = Depends(staff_only)):
    cap = _seat_cap(ctx)
    return {
        "initial": {
            "name": "", "email": "", "phone": "", "title": "", "bio": "", "photoUrl": "", "role": "BROKER", "languages": ["English"],
            "specialties": [], "areas": [], "capacity": 15, "weight": 1, "timezone": "Asia/Kolkata",
            "workingHours": DEFAULT_WORKING_HOURS, "territory": None, "territoryOn": False, "active": True, "password": "",
        },
        "mapCenter": _map_center(ctx),
        "atCap": cap is not None and _count(ctx) >= cap,
        "maxBrokers": cap,
    }


@router.get("/{broker_id}")
def broker_detail(broker_id: str, ctx: AdminCtx = Depends(staff_only)):
    b = ctx.db.scalars(select(Broker).where(Broker.id == broker_id)).first()
    if not b:
        raise NotFound("Team member not found")
    u = ctx.db.scalars(select(User).where(User.id == b.userId, User.tenantId == ctx.tenant.id)).first() if b.userId else None
    return {
        "id": b.id,
        "broker": ser(b),
        "initial": {
            "name": b.name, "email": b.email, "phone": b.phone or "", "title": b.title or "", "bio": b.bio or "", "photoUrl": b.photoUrl or "",
            "role": "ADMIN" if u and u.role == "ADMIN" else "BROKER", "languages": list(b.languages or []), "specialties": list(b.specialties or []),
            "areas": list(b.areas or []), "capacity": b.capacity, "weight": b.weight, "timezone": b.timezone,
            "workingHours": b.workingHours, "territory": b.territory, "territoryOn": b.territory is not None, "active": b.active, "password": "",
        },
        "mapCenter": _map_center(ctx),
        "isSelf": b.userId is not None and b.userId == ctx.user.id,
        "lockedRole": "Owner" if u and u.role == "OWNER" else None,
    }


@router.post("")
def create_broker(body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(staff_only)):
    data = parse_broker(body)
    password, role, mail = data.pop("password"), data.pop("role"), data.pop("email")
    db = ctx.db

    cap = _seat_cap(ctx)
    if cap is not None and _count(ctx) >= cap:
        raise UserError(f"Your plan allows {cap} broker seats. Upgrade to add more.")
    if db.scalars(select(User.id).where(User.tenantId == ctx.tenant.id, User.email == mail)).first():
        raise UserError("A user with this email already exists")
    generated = not password
    plain_password = password or secrets.token_urlsafe(6)
    if len(plain_password) < 8:
        raise UserError("Password must be at least 8 characters")

    user = User(tenantId=ctx.tenant.id, email=mail, name=data["name"], role=role, passwordHash=hash_password(plain_password))
    db.add(user)
    db.flush()
    data["territory"] = _json_or_null(data["territory"])
    data["workingHours"] = _json_or_null(data["workingHours"])
    broker = Broker(**data, email=mail, userId=user.id)
    db.add(broker)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise UserError("A user with this email already exists") from None
    return {"ok": True, "id": broker.id, "tempPassword": plain_password if generated else None}


@router.put("/{broker_id}")
def update_broker(broker_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(staff_only)):
    data = parse_broker(body)
    password, role, mail = data.pop("password"), data.pop("role"), data.pop("email")
    db = ctx.db

    broker = _broker(ctx, broker_id)
    user = db.scalars(select(User).where(User.id == broker.userId, User.tenantId == ctx.tenant.id)).first() if broker.userId else None
    if user:
        if mail != user.email and db.scalars(select(User.id).where(User.tenantId == ctx.tenant.id, User.email == mail, User.id != user.id)).first():
            raise UserError("Another user already uses this email")
        if password and len(password) < 8:
            raise UserError("Password must be at least 8 characters")

    for key, value in data.items():
        setattr(broker, key, _json_or_null(value) if key in ("territory", "workingHours") else value)
    broker.email = mail

    if user:
        user.email = mail
        user.name = data["name"]
        if user.role not in KEEP_ROLES:
            user.role = role
        if password:
            user.passwordHash = hash_password(password)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise UserError("Another user already uses this email") from None
    return {"ok": True, "id": broker_id}


@router.post("/{broker_id}/active")
def set_broker_active(broker_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(staff_only)):
    broker = _broker(ctx, broker_id)
    broker.active = bool(body.get("active"))
    ctx.db.commit()
    return {"ok": True}


@router.delete("/{broker_id}")
def delete_broker(broker_id: str, ctx: AdminCtx = Depends(staff_only)):
    db = ctx.db
    broker = _broker(ctx, broker_id)
    if broker.userId and broker.userId == ctx.user.id:
        raise UserError("You cannot remove your own account")
    if broker.userId:
        role = db.scalar(select(User.role).where(User.id == broker.userId, User.tenantId == ctx.tenant.id))
        if role == "OWNER":
            raise UserError("The account owner cannot be removed")
    open_leads = db.scalar(select(func.count(Lead.id)).where(Lead.brokerId == broker_id, Lead.status.in_(OPEN_STATUSES))) or 0
    user_id = broker.userId
    db.delete(broker)
    db.flush()
    if user_id:
        db.execute(delete(User).where(User.id == user_id, User.tenantId == ctx.tenant.id))
    db.commit()
    return {"ok": True, "orphaned": open_leads}
