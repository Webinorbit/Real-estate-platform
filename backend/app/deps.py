"""Request context: who is the tenant (from the host), who is the user (from the session cookie)."""

from dataclasses import dataclass
from typing import Callable, Iterable

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import ROOT_DOMAIN, tenant_switch_allowed, env
from app.db import bind_tenant, get_db
from app.errors import Forbidden, NotFound, PlanLocked, Unauthorized
from app.models import Tenant, User
from app.plans import plan_of
from app.security import COOKIE, read_token

TENANT_COOKIE = "tenant_override"
STAFF = ("OWNER", "ADMIN")
ANY_STAFF = ("OWNER", "ADMIN", "BROKER")


def host_parts(raw_host: str | None) -> tuple[str, str | None]:
    host = str(raw_host or "").split(":")[0].lower()
    if host.startswith("www."):
        host = host[4:]
    root = ROOT_DOMAIN()
    slug = None
    if host != root and host.endswith("." + root):
        slug = host[: -(len(root) + 1)]
        if "." in slug:
            slug = slug.split(".")[-1]
    return host, slug


def _active(db: Session, **where) -> Tenant | None:
    return db.scalars(select(Tenant).filter_by(active=True, **where).limit(1)).first()


def resolve_tenant(db: Session, request: Request) -> Tenant | None:
    """override cookie (dev/demo) -> custom domain -> <slug>.ROOT_DOMAIN -> DEFAULT_TENANT_SLUG -> first tenant."""
    host, slug = host_parts(request.headers.get("x-tenant-host") or request.headers.get("host"))

    if tenant_switch_allowed():
        override = request.cookies.get(TENANT_COOKIE)
        if override:
            t = _active(db, slug=override)
            if t:
                return t
    if host:
        t = _active(db, customDomain=host)
        if t:
            return t
    if slug:
        t = _active(db, slug=slug)
        if t:
            return t
    fallback = env("DEFAULT_TENANT_SLUG")
    if fallback:
        t = _active(db, slug=fallback)
        if t:
            return t
    return db.scalars(select(Tenant).where(Tenant.active.is_(True)).order_by(Tenant.createdAt.asc()).limit(1)).first()


@dataclass
class Ctx:
    request: Request
    db: Session
    tenant: Tenant


def public_ctx(request: Request, db: Session = Depends(get_db)) -> Ctx:
    tenant = resolve_tenant(db, request)
    if tenant is None:
        raise NotFound("No site is configured for this address")
    bind_tenant(db, tenant.id)
    return Ctx(request=request, db=db, tenant=tenant)


@dataclass
class AdminCtx(Ctx):
    user: User = None
    features: dict = None

    @property
    def isStaff(self) -> bool:
        return self.user.role == "SUPER" or self.user.role in STAFF

    @property
    def brokerId(self) -> str | None:
        return self.user.broker.id if self.user.broker else None


def current_user(ctx: Ctx) -> User | None:
    """Session user bound to the current tenant host. A tenant user may never act on another tenant."""
    token = ctx.request.cookies.get(COOKIE)
    if not token:
        auth = ctx.request.headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else None
    session = read_token(token)
    if not session or not session["uid"]:
        return None
    if session["role"] != "SUPER" and session["tid"] != ctx.tenant.id:
        return None
    return ctx.db.scalars(select(User).options(joinedload(User.broker)).where(User.id == session["uid"])).first()


def authed(roles: Iterable[str] | None = None, feature: str | None = None) -> Callable[..., AdminCtx]:
    """Dependency factory: a signed-in user with one of `roles` (SUPER always passes) on a plan that includes `feature`."""

    def dependency(ctx: Ctx = Depends(public_ctx)) -> AdminCtx:
        user = current_user(ctx)
        if user is None:
            raise Unauthorized()
        if roles and user.role not in roles and user.role != "SUPER":
            raise Forbidden()
        features = plan_of(ctx.tenant)
        if feature and not features.get(feature):
            raise PlanLocked(feature)
        return AdminCtx(request=ctx.request, db=ctx.db, tenant=ctx.tenant, user=user, features=features)

    return dependency


any_user = authed()
staff_only = authed(STAFF)
super_only = authed(("SUPER",))
