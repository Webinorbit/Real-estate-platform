"""Admin: wipe a client's data to start fresh (e.g. before importing a new setup zip).

POST /api/admin/data/reset
    OWNER or SUPER only (ADMIN / BROKER get 403). Body:
      {"confirm": "<business name, exactly as shown>", "listings": bool = true, "leads": bool = true, "team": bool = true}
    listings  every property with its virtual tours (scenes, hotspots), favourites and saved searches
    leads     every lead with its activity timeline and assignment history
    team      every team member and their login, except account owners and the person doing the reset;
              routing rules go too (they point at team members)
    Branding, settings, the plan and the owner's login are never touched. Uploaded image files stay in storage.
    -> {"ok": true, "deleted": {"listings": n, "tours": n, "leads": n, "team": n, "routingRules": n}}
"""

from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, func, select

from app.deps import AdminCtx, authed
from app.errors import UserError
from app.models import Broker, Favorite, Lead, Property, RoutingRule, SavedSearch, Tour, User

router = APIRouter(prefix="/api/admin/data")

owner_only = authed(("OWNER",))


def _flag(body: dict, key: str) -> bool:
    v = body.get(key, True)
    if not isinstance(v, bool):
        raise UserError(f"{key} must be true or false")
    return v


@router.post("/reset")
def reset_data(body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(owner_only)):
    tenant = ctx.tenant
    confirm = str(body.get("confirm") or "").strip()
    if confirm.lower() != (tenant.name or "").strip().lower():
        raise UserError(f'Type the business name "{tenant.name}" to confirm')
    listings, leads, team = _flag(body, "listings"), _flag(body, "leads"), _flag(body, "team")
    if not (listings or leads or team):
        raise UserError("Choose at least one thing to delete")

    db, tid = ctx.db, tenant.id
    count = lambda model: db.scalar(select(func.count(model.id)).where(model.tenantId == tid)) or 0  # noqa: E731
    deleted = {"listings": 0, "tours": 0, "leads": 0, "team": 0, "routingRules": 0}

    if leads:
        deleted["leads"] = count(Lead)
        db.execute(delete(Lead).where(Lead.tenantId == tid))  # activities and assignments cascade

    if listings:
        deleted["listings"], deleted["tours"] = count(Property), count(Tour)
        db.execute(delete(Favorite).where(Favorite.tenantId == tid))
        db.execute(delete(SavedSearch).where(SavedSearch.tenantId == tid))
        db.execute(delete(Tour).where(Tour.tenantId == tid))  # scenes and hotspots cascade
        db.execute(delete(Property).where(Property.tenantId == tid))

    if team:
        keep_users = set(db.scalars(select(User.id).where(User.tenantId == tid, User.role == "OWNER")))
        keep_users.add(ctx.user.id)
        doomed = [b for b in db.scalars(select(Broker).where(Broker.tenantId == tid)) if b.userId not in keep_users]
        user_ids = [b.userId for b in doomed if b.userId]
        deleted["team"], deleted["routingRules"] = len(doomed), count(RoutingRule)
        db.execute(delete(RoutingRule).where(RoutingRule.tenantId == tid))
        if doomed:
            db.execute(delete(Broker).where(Broker.id.in_([b.id for b in doomed])))
        if user_ids:
            db.execute(delete(User).where(User.tenantId == tid, User.id.in_(user_ids), User.role.in_(("BROKER", "ADMIN"))))

    db.commit()
    return {"ok": True, "deleted": deleted}
