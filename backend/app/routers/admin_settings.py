"""Admin API: branding & settings, plan & billing.

Ported from src/app/admin/(panel)/settings/{page.js,actions.js}, src/components/admin/settings-form.jsx and
src/app/admin/(panel)/plan/{page.js,actions.js}, src/components/admin/plan-switcher.jsx.

All endpoints need OWNER / ADMIN / SUPER (brokers get 403 {"error", "code": "forbidden"}, anonymous 401).
Errors are `{"error": "<readable message>"}` with 400 for invalid input. Datetimes are ISO-8601 'Z' strings.
The tenant is the one resolved from the request host (x-tenant-host / Host).

GET /api/admin/settings
    Response:
        {"initial": the object the settings form starts from:
             {"name","tagline","about","logoUrl","heroImages": [{"url","alt": ""}],"heroVideoUrl","primaryColor","accentColor",
              "fontHeading","fontBody","currency","areaUnit","contactEmail","contactPhone","whatsapp","address",
              "socials": {instagram?,facebook?,linkedin?,youtube?,x?},"mapLat","mapLng","mapZoom","slaMinutes","maxReassigns",
              "analyticsSiteId","webhookUrl","customDomain"}      (null text columns arrive as "")
         "tenant": full Tenant row (incl. webhookUrl),
         "features": {"slaAutomation": bool, "webhooks": bool, "customDomain": bool},    which form sections are unlocked
         "planFeatures": full plan feature dict (same as /api/auth/context "features"),
         "rootDomain": "<ROOT_DOMAIN env or empty>",
         "options": {"fonts": [...], "currencies": [{"code","locale"}], "areaUnits": [...], "mapPresets": [{label,lat,lng,zoom}]}}

PUT /api/admin/settings                                       (saveSettings)
    Body: the form values, with heroImages as a list of URL strings (the form maps {url,alt} -> url):
        {"name": str 2-80, "tagline": str<=140, "about": str<=2000, "logoUrl": str<=600, "heroImages": [str<=600] (<= 6),
         "heroVideoUrl": http(s) url, "primaryColor": "#rrggbb", "accentColor": "#rrggbb",
         "fontHeading": playfair|cormorant|fraunces|manrope|poppins|inter|dmsans, "fontBody": (same list),
         "currency": INR|USD|GBP|AED|EUR|AUD|CAD|SGD (locale is derived), "areaUnit": "sq ft"|"sq m"|"sq yd",
         "contactEmail": email, "contactPhone": str<=30, "whatsapp": str<=30, "address": str<=240,
         "socials": {"instagram","facebook","linkedin","youtube","x": http(s) url}, "mapLat": -90..90, "mapLng": -180..180,
         "mapZoom": 2..18, "slaMinutes": int 1-1440, "maxReassigns": int 0-10, "analyticsSiteId": str<=80,
         "webhookUrl": http(s) url (Enterprise only; https required in production), "customDomain": domain (Pro/Enterprise)}
    Blank strings are stored as null. A changed webhookUrl / customDomain is validated against the plan and (domain) for
    format, ROOT_DOMAIN and uniqueness; unchanged values are never re-validated.
    Response: {"ok": true}.
    400 messages as before: "Business name is required", "Colors must be a 6-digit hex value", "Links must start with https://",
        "Enter a valid contact email", "Webhooks are available on the Enterprise plan", "Webhook URLs must use https://",
        "Custom domains are available on Pro and Enterprise", "Enter a valid domain such as homes.yourbrand.com",
        "Use a domain you own, not <root>", "That domain is already connected to another site", ...

GET /api/admin/plan
    Response:
        {"tenant": {"id","name","plan"},
         "current": {"key": "PRO", ...plan definition below},
         "usage": [{"label": "Listings", "used": int, "cap": int|null}, {"label": "Broker seats", ...}],     cap null = unlimited
         "plans": [{"key": "STARTER"|"PRO"|"ENTERPRISE", "label", "priceHint", "maxListings": int|null, "maxBrokers": int|null,
                    "tours","routingRules","slaAutomation","customDomain","csvImport","webhooks","removeBranding": bool}],
         "canSwitch": bool}       true for SUPER only: show the demo plan switcher

PUT /api/admin/plan                                           (changePlan)
    Body: {"plan": "STARTER"|"PRO"|"ENTERPRISE"}  - changes the plan of the CURRENT (host) tenant.
    SUPER only: OWNER / ADMIN get 403 {"error": "Only WebInOrbit can change plans", "code": "forbidden"}.
    Response: {"ok": true, "plan": "<plan>"}.   400 "Unknown plan".
"""

import math
import re

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select

from app.config import env, is_production
from app.constants import CURRENCIES, FONT_CHOICES, MAP_PRESETS, PLANS
from app.deps import STAFF, authed
from app.errors import Forbidden, UserError
from app.models import Broker, Property, Tenant
from app.plans import FEATURE_KEYS, PLAN_DEFS, can, features_json
from app.serialize import ser
from app.validate import HEX_RE, choice, email, https_url, number, opt_text, req_text

router = APIRouter(prefix="/api/admin")

staff_ctx = authed(STAFF)

AREA_UNITS = ["sq ft", "sq m", "sq yd"]
SOCIAL_KEYS = ("instagram", "facebook", "linkedin", "youtube", "x")
HOST_RE = re.compile(r"(?=.{4,120}\Z)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\Z")
DEFAULT_HERO = "/demo/photos/hero-01.jpg"
PRICE_HINTS = {
    "STARTER": "For solo agents getting online",
    "PRO": "For growing agencies",
    "ENTERPRISE": "For brokerages and developers",
}


def hero_images(tenant: Tenant) -> list[str]:
    urls = [s.strip() for s in str(tenant.heroImageUrl or "").split(",") if s.strip()]
    return urls or [DEFAULT_HERO]


def _hex(v, label: str) -> str:
    s = v if isinstance(v, str) else ""
    if not HEX_RE.match(s):
        raise UserError("Colors must be a 6-digit hex value")
    return s


def _parse_settings(body: dict) -> dict:
    """The zod schema field by field in schema order, so the first problem reported matches the old form."""
    d: dict = {}
    d["name"] = req_text(body.get("name"), "Business name", min_len=2, max_len=80, message="Business name is required")
    d["tagline"] = opt_text(body.get("tagline"), 140, "Tagline")
    d["about"] = opt_text(body.get("about"), 2000, "About")
    d["logoUrl"] = opt_text(body.get("logoUrl"), 600, "Logo URL")

    hero = body.get("heroImages")
    if hero is None:
        hero = []
    if not isinstance(hero, list) or len(hero) > 6 or any(not isinstance(u, str) or len(u) > 600 for u in hero):
        raise UserError("Add up to 6 hero images")
    d["heroImages"] = hero

    d["heroVideoUrl"] = https_url(body.get("heroVideoUrl"))
    d["primaryColor"] = _hex(body.get("primaryColor"), "Primary color")
    d["accentColor"] = _hex(body.get("accentColor"), "Accent color")
    d["fontHeading"] = choice(body.get("fontHeading"), FONT_CHOICES, "Heading font")
    d["fontBody"] = choice(body.get("fontBody"), FONT_CHOICES, "Body font")
    d["currency"] = choice(body.get("currency"), CURRENCIES, "Currency")
    d["areaUnit"] = choice(body.get("areaUnit"), AREA_UNITS, "Area unit")
    contact_email = opt_text(body.get("contactEmail"), 10_000)
    d["contactEmail"] = email(contact_email, "Enter a valid contact email") if contact_email else None
    d["contactPhone"] = opt_text(body.get("contactPhone"), 30, "Phone")
    d["whatsapp"] = opt_text(body.get("whatsapp"), 30, "WhatsApp number")
    d["address"] = opt_text(body.get("address"), 240, "Address")

    socials = body.get("socials")
    if socials is None:
        socials = {}
    if not isinstance(socials, dict):
        raise UserError("Social links are not valid")
    d["socials"] = {k: v for k in SOCIAL_KEYS if (v := https_url(socials.get(k)))}

    d["mapLat"] = number(body.get("mapLat"), "Map latitude", -90, 90, message="Map latitude must be between -90 and 90")
    d["mapLng"] = number(body.get("mapLng"), "Map longitude", -180, 180, message="Map longitude must be between -180 and 180")
    d["mapZoom"] = number(body.get("mapZoom"), "Map zoom", 2, 18, message="Map zoom must be between 2 and 18")
    d["slaMinutes"] = number(body.get("slaMinutes"), "First-response SLA", 1, 1440, integer=True, message="First-response SLA must be a whole number of minutes between 1 and 1440")
    d["maxReassigns"] = number(body.get("maxReassigns"), "Max automatic reassignments", 0, 10, integer=True, message="Max automatic reassignments must be a whole number between 0 and 10")
    d["analyticsSiteId"] = opt_text(body.get("analyticsSiteId"), 80, "Analytics site ID")
    d["webhookUrl"] = https_url(body.get("webhookUrl"))
    d["customDomain"] = opt_text(body.get("customDomain"), 120, "Domain")
    return d


def normalise_domain(raw: str | None) -> str | None:
    if not raw:
        return None
    domain = re.sub(r"^https?://", "", raw.lower())
    domain = re.sub(r"/.*$", "", domain, flags=re.S)
    return re.sub(r"^www\.", "", domain)


def settings_initial(tenant: Tenant) -> dict:
    return {
        "name": tenant.name, "tagline": tenant.tagline or "", "about": tenant.about or "", "logoUrl": tenant.logoUrl or "",
        "heroImages": [{"url": u, "alt": ""} for u in hero_images(tenant)] if tenant.heroImageUrl else [],
        "heroVideoUrl": tenant.heroVideoUrl or "", "primaryColor": tenant.primaryColor, "accentColor": tenant.accentColor,
        "fontHeading": tenant.fontHeading, "fontBody": tenant.fontBody, "currency": tenant.currency, "areaUnit": tenant.areaUnit,
        "contactEmail": tenant.contactEmail or "", "contactPhone": tenant.contactPhone or "", "whatsapp": tenant.whatsapp or "",
        "address": tenant.address or "", "socials": tenant.socials or {}, "mapLat": tenant.mapLat, "mapLng": tenant.mapLng,
        "mapZoom": tenant.mapZoom, "slaMinutes": tenant.slaMinutes, "maxReassigns": tenant.maxReassigns,
        "analyticsSiteId": tenant.analyticsSiteId or "", "webhookUrl": tenant.webhookUrl or "", "customDomain": tenant.customDomain or "",
    }


@router.get("/settings")
def get_settings(ctx=Depends(staff_ctx)):
    tenant = ctx.tenant
    return {
        "initial": settings_initial(tenant),
        "tenant": ser(tenant),
        "features": {k: bool(ctx.features.get(k)) for k in ("slaAutomation", "webhooks", "customDomain")},
        "planFeatures": features_json(tenant),
        "rootDomain": env("ROOT_DOMAIN") or "",
        "options": {
            "fonts": FONT_CHOICES,
            "currencies": [{"code": code, "locale": locale} for code, locale in CURRENCIES.items()],
            "areaUnits": AREA_UNITS,
            "mapPresets": MAP_PRESETS,
        },
    }


@router.put("/settings")
def save_settings(ctx=Depends(staff_ctx), body: dict = Body(default_factory=dict)):
    d = _parse_settings(body)
    tenant: Tenant = ctx.tenant
    hero, domain_input, webhook_url = d.pop("heroImages"), d.pop("customDomain"), d.pop("webhookUrl")

    data = {**d, "heroImageUrl": ",".join(hero) or None, "locale": CURRENCIES[d["currency"]]}

    if webhook_url != (tenant.webhookUrl or None):
        if webhook_url and not can(tenant, "webhooks"):
            raise UserError("Webhooks are available on the Enterprise plan")
        if webhook_url and not webhook_url.startswith("https://") and is_production():
            raise UserError("Webhook URLs must use https://")
        data["webhookUrl"] = webhook_url

    domain = normalise_domain(domain_input)
    if domain != (tenant.customDomain or None):
        if domain and not can(tenant, "customDomain"):
            raise UserError("Custom domains are available on Pro and Enterprise")
        if domain:
            if not HOST_RE.match(domain):
                raise UserError("Enter a valid domain such as homes.yourbrand.com")
            root = (env("ROOT_DOMAIN") or "").lower()
            if root and (domain == root or domain.endswith(f".{root}")):
                raise UserError(f"Use a domain you own, not {root}")
            if ctx.db.scalars(select(Tenant.id).where(Tenant.customDomain == domain, Tenant.id != tenant.id)).first():
                raise UserError("That domain is already connected to another site")
        data["customDomain"] = domain

    for key, value in data.items():
        setattr(tenant, key, value)
    ctx.db.commit()
    return {"ok": True}


def _cap(value: float) -> int | None:
    return None if math.isinf(value) else int(value)


def plan_json(key: str) -> dict:
    p = PLAN_DEFS[key]
    out = {k: bool(p[k]) for k in FEATURE_KEYS}
    return {"key": key, "label": p["label"], "priceHint": PRICE_HINTS[key], "maxListings": _cap(p["maxListings"]), "maxBrokers": _cap(p["maxBrokers"]), **out}


@router.get("/plan")
def get_plan(ctx=Depends(staff_ctx)):
    db, tenant = ctx.db, ctx.tenant
    listings = db.scalar(select(func.count(Property.id)))
    brokers = db.scalar(select(func.count(Broker.id)))
    current = plan_json(tenant.plan if tenant.plan in PLAN_DEFS else "STARTER")
    return {
        "tenant": {"id": tenant.id, "name": tenant.name, "plan": tenant.plan},
        "current": current,
        "usage": [
            {"label": "Listings", "used": listings, "cap": current["maxListings"]},
            {"label": "Broker seats", "used": brokers, "cap": current["maxBrokers"]},
        ],
        "plans": [plan_json(k) for k in PLAN_DEFS],
        "canSwitch": ctx.user.role == "SUPER",
    }


@router.put("/plan")
def change_plan(ctx=Depends(staff_ctx), body: dict = Body(default_factory=dict)):
    if ctx.user.role != "SUPER":
        raise Forbidden("Only WebInOrbit can change plans")
    plan = body.get("plan")
    if plan not in PLANS:
        raise UserError("Unknown plan")
    ctx.tenant.plan = plan
    ctx.db.commit()
    return {"ok": True, "plan": plan}
