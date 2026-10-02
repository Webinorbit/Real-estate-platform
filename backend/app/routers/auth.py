from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import select

from app.config import is_production
from app.deps import Ctx, authed, public_ctx
from app.errors import Unauthorized, UserError
from app.models import User
from app.plans import features_json
from app.rate_limit import client_ip, rate_limit
from app.security import COOKIE, MAX_AGE, create_token, verify_password
from app.serialize import ser

router = APIRouter(prefix="/api/auth")

_DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8h0M5Zc3m1c3Q8o2Y1pXq0m9vKq3fO"


def user_json(user: User) -> dict:
    return ser(user, exclude=("passwordHash",), brokerId=user.broker.id if user.broker else None)


@router.post("/login")
def login(response: Response, ctx: Ctx = Depends(public_ctx), body: dict = Body(default_factory=dict)):
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")

    limit = 8 if is_production() else 200
    if not rate_limit(f"login:{client_ip(ctx.request)}:{email}", limit, 600)["ok"]:
        raise UserError("Too many attempts. Please wait a few minutes and try again.", status=429)
    if not email or not password:
        raise UserError("Enter your email and password.", status=400)

    db = ctx.db
    user = db.scalars(select(User).where(User.tenantId == ctx.tenant.id, User.email == email)).first() or db.scalars(
        select(User).where(User.tenantId.is_(None), User.email == email, User.role == "SUPER")
    ).first()

    ok = verify_password(password, user.passwordHash if user else _DUMMY_HASH)
    if not user or not ok:
        raise UserError("Those credentials do not match. Check your email and password.", status=401)

    response.set_cookie(COOKIE, create_token(user), max_age=MAX_AGE, httponly=True, samesite="lax", secure=is_production(), path="/")
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(ctx=Depends(authed())):
    return {"user": user_json(ctx.user)}


@router.get("/context")
def admin_context(ctx=Depends(authed())):
    """Everything an admin page needs to render the shell: user, tenant, plan features."""
    from sqlalchemy import func

    from app.deps import STAFF
    from app.models import Lead

    new_leads = select(func.count(Lead.id)).where(Lead.status == "NEW")
    if not ctx.isStaff:
        new_leads = new_leads.where(Lead.brokerId == (ctx.brokerId or "none"))
    broker = ctx.user.broker
    return {
        "user": user_json(ctx.user),
        "photoUrl": broker.photoUrl if broker else None,
        "newLeads": ctx.db.scalar(new_leads) or 0,
        "tenant": ser(ctx.tenant),
        "features": features_json(ctx.tenant),
        "isStaff": ctx.isStaff,
        "brokerId": ctx.brokerId,
        "staffRoles": list(STAFF),
    }
