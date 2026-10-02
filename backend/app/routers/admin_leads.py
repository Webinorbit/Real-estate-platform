"""Admin leads and pipeline.

Brokers (non-staff) only ever see and act on leads assigned to them; staff (OWNER/ADMIN/SUPER) see every lead.
All dates are ISO-8601 strings; lead objects carry every Lead column under its DB name.

GET /api/admin/leads?status=&broker=&q=&page=
    Auth: any signed-in user.
    status: NEW|CONTACTED|VIEWING|NEGOTIATION|WON|LOST|open (anything else = all). broker: staff only, a broker id or "unassigned".
    q: matches name/email (case-insensitive) or phone (substring), first 80 chars. page: 1-based, 25 per page, newest first.
    Response: {
      leads: [{...Lead, property: {title, slug}|null, broker: {name, photoUrl}|null}],
      total, page, pages, pageSize,
      counts: {NEW, CONTACTED, VIEWING, NEGOTIATION, WON, LOST}, allCount,    (scoped to the user, ignoring the filters)
      brokers: [{id, name}],                                                   (staff only, else [])
      filters: {status: str|null, broker: str|null, q: str},                   (as normalised by the server)
      isStaff
    }

GET /api/admin/leads/{id}
    Auth: any signed-in user (404 for a missing lead or a lead assigned to another broker).
    Response: {
      lead: {...Lead, property: {...Property}|null, broker: {...Broker}|null,
             activities: [{...LeadActivity}] newest first,
             assignments: [{...Assignment, broker: {name, photoUrl}|null}] newest first},
      audit: {candidates: [...], trace: [...]}|null,   (normalised candidates JSON of the latest assignment)
      brokers: [{id, name}],                            (staff only: active brokers by name, for manual assign; else [])
      isStaff
    }

POST /api/admin/leads/{id}/status          body {status, lostReason?}        -> {ok: true}
    Auth: any signed-in user (brokers: own leads only). Errors: "Unknown status", "Lead not found",
    "This lead is assigned to another broker". Moving off NEW stops the SLA clock; lostReason is kept for LOST.

POST /api/admin/leads/{id}/notes           body {note}                       -> {ok: true, activity: {...LeadActivity}}
    Auth: any signed-in user (brokers: own leads only). Errors: "Write a note first", ownership as above. Max 2000 chars.

POST /api/admin/leads/{id}/assign          body {brokerId}                   -> {ok: true}
    Auth: staff only. Manual (re)assignment; writes an Assignment (MANUAL) and an activity. Error: "Lead or broker not found".

GET /api/admin/pipeline
    Auth: any signed-in user. Open leads plus any lead updated in the last 90 days (max 300, newest first).
    Response: {leads: [{id, name, status, property: str|null, brokerName: str|null, brokerPhoto: str|null,
                        createdAt, slaDueAt: str|null, firstResponseAt: str|null}]}
    Drag moves use POST /api/admin/leads/{id}/status.
"""

from datetime import timedelta

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, or_, select

from app.constants import LEAD_STATUSES, OPEN_STATUSES
from app.deps import STAFF, AdminCtx, any_user, authed
from app.errors import NotFound, UserError
from app.models import Assignment, Broker, Lead, LeadActivity, Property, utcnow
from app.routing.service import add_lead_note, assign_lead_manually, set_lead_status
from app.serialize import iso, ser

router = APIRouter(prefix="/api/admin")
PAGE = 25


def _page_number(raw: str | None) -> int:
    try:
        n = float(raw) if raw not in (None, "") else 1
    except ValueError:
        return 1
    return max(1, int(n)) if n == n and abs(n) != float("inf") else 1


def _own_lead(ctx: AdminCtx, lead_id) -> Lead:
    lead = ctx.db.scalars(select(Lead).where(Lead.id == str(lead_id or ""))).first()
    if not lead:
        raise UserError("Lead not found")
    if not ctx.isStaff and (ctx.brokerId is None or lead.brokerId != ctx.brokerId):
        raise UserError("This lead is assigned to another broker")
    return lead


def _lookup(ctx: AdminCtx, model, ids, *columns) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {row[0]: row for row in ctx.db.execute(select(model.id, *columns).where(model.id.in_(ids))).all()}


@router.get("/leads")
def list_leads(
    ctx: AdminCtx = Depends(any_user),
    status: str | None = Query(None),
    broker: str | None = Query(None),
    q: str | None = Query(None),
    page: str | None = Query(None),
):
    db = ctx.db
    norm_status = status if status in LEAD_STATUSES else "open" if status == "open" else None
    text = q.strip()[:80] if isinstance(q, str) else ""
    broker_filter = (broker or None) if ctx.isStaff else (ctx.brokerId or "none")
    page_no = _page_number(page)

    where = []
    if norm_status == "open":
        where.append(Lead.status.in_(OPEN_STATUSES))
    elif norm_status:
        where.append(Lead.status == norm_status)
    if broker_filter == "unassigned":
        where.append(Lead.brokerId.is_(None))
    elif broker_filter:
        where.append(Lead.brokerId == broker_filter)
    if text:
        where.append(or_(Lead.name.icontains(text, autoescape=True), Lead.email.icontains(text, autoescape=True), Lead.phone.contains(text, autoescape=True)))
    base = [] if ctx.isStaff else [Lead.brokerId == (ctx.brokerId or "none")]

    rows = db.scalars(select(Lead).where(*where).order_by(Lead.createdAt.desc(), Lead.id.asc()).offset((page_no - 1) * PAGE).limit(PAGE)).all()
    total = db.scalar(select(func.count(Lead.id)).where(*where)) or 0
    grouped = dict(db.execute(select(Lead.status, func.count(Lead.id)).where(*base).group_by(Lead.status)).all())
    brokers = db.execute(select(Broker.id, Broker.name).order_by(Broker.name.asc())).all() if ctx.isStaff else []

    props = _lookup(ctx, Property, (r.propertyId for r in rows), Property.title, Property.slug)
    brks = _lookup(ctx, Broker, (r.brokerId for r in rows), Broker.name, Broker.photoUrl)
    leads = [
        ser(
            r,
            property={"title": props[r.propertyId].title, "slug": props[r.propertyId].slug} if r.propertyId in props else None,
            broker={"name": brks[r.brokerId].name, "photoUrl": brks[r.brokerId].photoUrl} if r.brokerId in brks else None,
        )
        for r in rows
    ]
    return {
        "leads": leads,
        "total": total,
        "page": page_no,
        "pages": -(-total // PAGE),
        "pageSize": PAGE,
        "counts": {s: grouped.get(s, 0) for s in LEAD_STATUSES},
        "allCount": sum(grouped.values()),
        "brokers": [{"id": b.id, "name": b.name} for b in brokers],
        "filters": {"status": norm_status, "broker": broker_filter if ctx.isStaff else None, "q": text},
        "isStaff": ctx.isStaff,
    }


def _normalise_audit(candidates) -> dict:
    if isinstance(candidates, list):
        return {"candidates": candidates, "trace": []}
    if isinstance(candidates, dict):
        return {"candidates": candidates.get("candidates") or [], "trace": candidates.get("trace") or []}
    return {"candidates": [], "trace": []}


@router.get("/leads/{lead_id}")
def lead_detail(lead_id: str, ctx: AdminCtx = Depends(any_user)):
    db = ctx.db
    lead = db.scalars(select(Lead).where(Lead.id == lead_id)).first()
    if not lead or (not ctx.isStaff and (ctx.brokerId is None or lead.brokerId != ctx.brokerId)):
        raise NotFound("Lead not found")

    prop = db.scalars(select(Property).where(Property.id == lead.propertyId)).first() if lead.propertyId else None
    broker = db.scalars(select(Broker).where(Broker.id == lead.brokerId)).first() if lead.brokerId else None
    activities = db.scalars(select(LeadActivity).where(LeadActivity.leadId == lead.id).order_by(LeadActivity.createdAt.desc(), LeadActivity.id.desc())).all()
    assignments = db.scalars(select(Assignment).where(Assignment.leadId == lead.id).order_by(Assignment.createdAt.desc(), Assignment.id.desc())).all()
    assignees = _lookup(ctx, Broker, (a.brokerId for a in assignments), Broker.name, Broker.photoUrl)
    options = db.execute(select(Broker.id, Broker.name).where(Broker.active.is_(True)).order_by(Broker.name.asc())).all() if ctx.isStaff else []

    return {
        "lead": ser(
            lead,
            property=ser(prop),
            broker=ser(broker),
            activities=[ser(a) for a in activities],
            assignments=[
                ser(a, broker={"name": assignees[a.brokerId].name, "photoUrl": assignees[a.brokerId].photoUrl} if a.brokerId in assignees else None)
                for a in assignments
            ],
        ),
        "audit": _normalise_audit(assignments[0].candidates) if assignments else None,
        "brokers": [{"id": b.id, "name": b.name} for b in options],
        "isStaff": ctx.isStaff,
    }


@router.post("/leads/{lead_id}/status")
def update_lead_status(lead_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(any_user)):
    status = body.get("status")
    if status not in LEAD_STATUSES:
        raise UserError("Unknown status")
    _own_lead(ctx, lead_id)
    reason = body.get("lostReason")
    set_lead_status(ctx.db, ctx.tenant, lead_id, status, actor=ctx.user.name, lost_reason=str(reason)[:500] if reason else None)
    return {"ok": True}


@router.post("/leads/{lead_id}/notes")
def add_note(lead_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(any_user)):
    note = body.get("note")
    text = str(note or "").strip()
    if not text:
        raise UserError("Write a note first")
    _own_lead(ctx, lead_id)
    activity = add_lead_note(ctx.db, lead_id, text[:2000], ctx.user.name)
    return {"ok": True, "activity": ser(activity)}


@router.post("/leads/{lead_id}/assign")
def reassign_lead(lead_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(authed(STAFF))):
    broker_id = str(body.get("brokerId") or "")
    lead = ctx.db.scalars(select(Lead.id).where(Lead.id == lead_id)).first()
    broker = ctx.db.scalars(select(Broker.id).where(Broker.id == broker_id)).first() if broker_id else None
    if not lead or not broker:
        raise UserError("Lead or broker not found")
    assign_lead_manually(ctx.db, ctx.tenant, lead_id, broker_id, ctx.user.name)
    return {"ok": True}


@router.get("/pipeline")
def pipeline(ctx: AdminCtx = Depends(any_user)):
    since = utcnow() - timedelta(days=90)
    scope = [] if ctx.isStaff else [Lead.brokerId == (ctx.brokerId or "none")]
    rows = ctx.db.scalars(
        select(Lead)
        .where(*scope, or_(Lead.status.in_(OPEN_STATUSES), Lead.updatedAt >= since))
        .order_by(Lead.createdAt.desc(), Lead.id.asc())
        .limit(300)
    ).all()
    props = _lookup(ctx, Property, (r.propertyId for r in rows), Property.title)
    brks = _lookup(ctx, Broker, (r.brokerId for r in rows), Broker.name, Broker.photoUrl)
    return {
        "leads": [
            {
                "id": l.id,
                "name": l.name,
                "status": l.status,
                "property": props[l.propertyId].title if l.propertyId in props else None,
                "brokerName": brks[l.brokerId].name if l.brokerId in brks else None,
                "brokerPhoto": (brks[l.brokerId].photoUrl or None) if l.brokerId in brks else None,
                "createdAt": iso(l.createdAt),
                "slaDueAt": iso(l.slaDueAt),
                "firstResponseAt": iso(l.firstResponseAt),
            }
            for l in rows
        ]
    }
