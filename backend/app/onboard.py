"""Tenant onboarding: creates a tenant and its owner login (plus the owner's broker profile).

Shared by the CLI (`python -m app.cli tenant:create`) and the super-admin Clients endpoint. Port of src/lib/onboard.js.
"""

import re
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.constants import MAP_PRESETS
from app.errors import UserError
from app.ids import new_id
from app.models import Broker, Tenant, User
from app.security import hash_password

RESERVED = {"www", "admin", "api", "app", "mail", "static", "assets", "cdn", "demo", "localhost"}
SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,38}[a-z0-9]")
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PLANS = ["STARTER", "PRO", "ENTERPRISE"]

_ALIASES = {
    "ownerEmail": "owner_email",
    "ownerName": "owner_name",
    "customDomain": "custom_domain",
}


def _get(data: dict, key: str):
    """Accepts the JS-style camelCase keys as well as snake_case ones."""
    value = data.get(key)
    if value in (None, "") and key in _ALIASES:
        value = data.get(_ALIASES[key])
    return value


def _text(value) -> str:
    return "" if value is None else str(value).strip()


def onboard_tenant(db, data: dict) -> dict:
    """Validates `data`, creates the tenant + owner user + owner broker and commits.

    `data` keys: name, slug, plan, ownerEmail, ownerName, password, customDomain, city, currency, tagline.
    Returns {"tenant": Tenant, "owner": User, "password": str}. Raises UserError for anything the caller can fix.
    Use an unbound session (not `bind_tenant`): the new rows belong to a tenant that does not exist yet.
    """
    name = _text(_get(data, "name"))
    slug = _text(_get(data, "slug")).lower()
    plan = (_text(_get(data, "plan")) or "STARTER").upper()
    owner_email = _text(_get(data, "ownerEmail")).lower()
    owner_name = _text(_get(data, "ownerName")) or name
    custom_domain = (_text(_get(data, "customDomain")).lower() or None) if _get(data, "customDomain") else None

    if len(name) < 2:
        raise UserError("Business name is required")
    if not SLUG_RE.fullmatch(slug) or slug in RESERVED:
        raise UserError("Slug must be 3-40 characters: lowercase letters, numbers and hyphens (and not a reserved word)")
    if plan not in PLANS:
        raise UserError(f"Plan must be one of {', '.join(PLANS)}")
    if not EMAIL_RE.fullmatch(owner_email):
        raise UserError("A valid owner email is required")

    if db.scalar(select(Tenant.id).where(Tenant.slug == slug)):
        raise UserError(f"The slug \u201c{slug}\u201d is already taken")
    if custom_domain and db.scalar(select(Tenant.id).where(Tenant.customDomain == custom_domain)):
        raise UserError("That custom domain is already connected")

    password = str(_get(data, "password")) if _get(data, "password") else secrets.token_urlsafe(6)
    if len(password) < 8:
        raise UserError("Password must be at least 8 characters")

    wanted_city = str(data.get("city") or "").lower()
    city = next((p for p in MAP_PRESETS if p["label"].lower() == wanted_city), None)

    fields = {}
    if city:
        fields.update(mapLat=city["lat"], mapLng=city["lng"], mapZoom=city["zoom"])
    if data.get("currency"):
        fields["currency"] = str(data["currency"]).upper()

    tenant = Tenant(
        id=new_id(),
        slug=slug,
        name=name,
        plan=plan,
        customDomain=custom_domain,
        contactEmail=owner_email,
        tagline=data.get("tagline") or "Find a home you will love",
        **fields,
    )
    owner = User(
        id=new_id(), tenantId=tenant.id, email=owner_email, name=owner_name, role="OWNER", passwordHash=hash_password(password)
    )
    broker = Broker(
        id=new_id(), tenantId=tenant.id, userId=owner.id, name=owner_name, email=owner_email,
        title="Principal", languages=["English"], capacity=25,
    )
    try:
        db.add_all([tenant, owner, broker])
        db.commit()
    except IntegrityError:
        db.rollback()
        if custom_domain and db.scalar(select(Tenant.id).where(Tenant.customDomain == custom_domain)):
            raise UserError("That custom domain is already connected") from None
        raise UserError(f"The slug \u201c{slug}\u201d is already taken") from None
    return {"tenant": tenant, "owner": owner, "password": password}
