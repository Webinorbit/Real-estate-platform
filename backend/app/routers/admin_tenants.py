"""Admin API: platform console ("Clients") for WebInOrbit staff.

Ported from src/app/admin/(panel)/tenants/{page.js,actions.js}, src/components/admin/tenants-console.jsx and src/lib/onboard.js.

SUPER users only (OWNER / ADMIN / BROKER get 403 {"error", "code": "forbidden"}, anonymous 401). These endpoints work across
all tenants, whatever tenant the request host resolves to.
Errors are `{"error": "<readable message>"}` with 400 (invalid input) or 404 (unknown tenant). Datetimes are ISO-8601 'Z' strings.

GET /api/admin/tenants
    Response:
        {"root": "<ROOT_DOMAIN env, default 'localhost:3000'>",
         "tenants": [{"id","name","slug","customDomain","plan","active","createdAt","properties": int,"brokers": int,"leads": int,
                      "url": "<admin URL>"}]}        oldest first.  url = https://<customDomain>/admin, or "/?tenant=<slug>" on a
                                                     localhost root, or https://<slug>.<root>/admin

POST /api/admin/tenants                                       (createTenant)
    Body: {"name": str, "slug": str (3-40, a-z 0-9 -), "plan": STARTER|PRO|ENTERPRISE = STARTER, "ownerEmail": email,
           "ownerName": str = name, "customDomain": str|"" , "city": a map preset label (Mumbai, Bengaluru, Delhi NCR, Dubai,
           London, New York), "password": str >= 8 chars (default: generated), "currency": str, "tagline": str}
    Creates the tenant, its OWNER login and the owner's broker profile.
    Response: {"ok": true, "slug": "...", "email": "<owner email>", "password": "<plain password, shown once>"}
    400 "Business name is required", "Slug must be 3-40 characters: ...", "The slug “x” is already taken",
        "That custom domain is already connected", "A valid owner email is required", "Password must be at least 8 characters", ...

PUT /api/admin/tenants/{id}/active                            (setTenantActive)
    Body: {"active": bool}.  Response: {"ok": true}.   404 "Client not found".  A suspended tenant stops resolving from its host.

PUT /api/admin/tenants/{id}/plan                              (setTenantPlan)
    Body: {"plan": "STARTER"|"PRO"|"ENTERPRISE"}.  Response: {"ok": true}.   400 "Unknown plan", 404 "Client not found".
"""

from typing import Iterator

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import env
from app.constants import PLANS
from app.db import SessionLocal
from app.deps import super_only
from app.errors import NotFound, UserError
from app.models import Broker, Lead, Property, Tenant
from app.serialize import iso
from app.validate import boolean

router = APIRouter(prefix="/api/admin/tenants")


def platform_db(_ctx=Depends(super_only)) -> Iterator[Session]:
    """Unbound session for cross-tenant work. Only reachable after `super_only` has passed."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _counts(db: Session, model) -> dict[str, int]:
    return dict(db.execute(select(model.tenantId, func.count(model.id)).group_by(model.tenantId)).all())


def tenant_url(t: Tenant, root: str) -> str:
    if t.customDomain:
        return f"https://{t.customDomain}/admin"
    if root.startswith("localhost"):
        return f"/?tenant={t.slug}"
    return f"https://{t.slug}.{root}/admin"


def _tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFound("Client not found")
    return tenant


@router.get("")
def list_tenants(db: Session = Depends(platform_db)):
    root = env("ROOT_DOMAIN") or "localhost:3000"
    tenants = db.scalars(select(Tenant).order_by(Tenant.createdAt.asc())).all()
    props, brokers, leads = _counts(db, Property), _counts(db, Broker), _counts(db, Lead)
    return {
        "root": root,
        "tenants": [
            {
                "id": t.id, "name": t.name, "slug": t.slug, "customDomain": t.customDomain, "plan": t.plan, "active": t.active,
                "createdAt": iso(t.createdAt), "properties": props.get(t.id, 0), "brokers": brokers.get(t.id, 0), "leads": leads.get(t.id, 0),
                "url": tenant_url(t, root),
            }
            for t in tenants
        ],
    }


@router.post("")
def create_tenant(db: Session = Depends(platform_db), body: dict = Body(default_factory=dict)):
    from app.onboard import onboard_tenant

    try:
        result = onboard_tenant(db, body)
    except Exception:
        db.rollback()
        raise
    return {"ok": True, "slug": result["tenant"].slug, "email": result["owner"].email, "password": result["password"]}


@router.put("/{tenant_id}/active")
def set_active(tenant_id: str, db: Session = Depends(platform_db), body: dict = Body(default_factory=dict)):
    tenant = _tenant(db, tenant_id)
    tenant.active = boolean(body.get("active"))
    db.commit()
    return {"ok": True}


@router.put("/{tenant_id}/plan")
def set_plan(tenant_id: str, db: Session = Depends(platform_db), body: dict = Body(default_factory=dict)):
    plan = body.get("plan")
    if plan not in PLANS:
        raise UserError("Unknown plan")
    _tenant(db, tenant_id).plan = plan
    db.commit()
    return {"ok": True}
