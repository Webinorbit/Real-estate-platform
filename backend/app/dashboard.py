"""Dashboard aggregates (port of src/lib/dashboard.js). Raw values only; the front end formats them."""

import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants import LEAD_SOURCES, LEAD_STATUSES, OPEN_STATUSES
from app.models import Broker, Lead, LeadActivity, Property, utcnow
from app.serialize import iso

DAY = timedelta(days=1)


def js_round(x: float) -> int:
    """Math.round semantics (halves go up), not Python's banker's rounding."""
    return math.floor(x + 0.5)


def _minutes(lead) -> float:
    return (lead.firstResponseAt - lead.createdAt).total_seconds() / 60


def _avg_response(rows) -> int | None:
    answered = [r for r in rows if r.firstResponseAt]
    return js_round(sum(_minutes(r) for r in answered) / len(answered)) if answered else None


def _win_rate(rows) -> int:
    return js_round(sum(1 for r in rows if r.status == "WON") / len(rows) * 100) if rows else 0


def _delta(a: int, b: int) -> int:
    if b:
        return js_round((a - b) / b * 100)
    return 100 if a else 0


def _first_image_url(images) -> str | None:
    if not isinstance(images, list) or not images:
        return None
    first = images[0]
    return first.get("url") if isinstance(first, dict) else None


def get_dashboard_data(db: Session, is_staff: bool, broker_id: str | None, now=None) -> dict:
    now = now or utcnow()
    since = now - 60 * DAY
    scope_id = broker_id or "none"
    lead_scope = [] if is_staff else [Lead.brokerId == scope_id]

    leads = db.execute(
        select(Lead.id, Lead.createdAt, Lead.status, Lead.source, Lead.brokerId, Lead.firstResponseAt)
        .where(*lead_scope, Lead.createdAt >= since)
    ).all()
    brokers = (
        db.execute(select(Broker.id, Broker.name, Broker.photoUrl, Broker.title, Broker.capacity).where(Broker.active.is_(True)).order_by(Broker.name.asc())).all()
        if is_staff
        else []
    )
    properties = db.execute(select(Property.id, Property.title, Property.slug, Property.views, Property.images).where(Property.status == "ACTIVE")).all()
    open_by_broker = (
        dict(
            db.execute(
                select(Lead.brokerId, func.count(Lead.id)).where(Lead.status.in_(OPEN_STATUSES), Lead.brokerId.is_not(None)).group_by(Lead.brokerId)
            ).all()
        )
        if is_staff
        else {}
    )
    at_risk_rows = db.execute(
        select(Lead.id, Lead.name, Lead.propertyId, Lead.brokerId, Lead.slaDueAt, Lead.escalated)
        .where(*lead_scope, Lead.status == "NEW", Lead.slaDueAt.is_not(None))
        .order_by(Lead.slaDueAt.asc())
        .limit(6)
    ).all()
    activity_query = select(LeadActivity.id, LeadActivity.type, LeadActivity.note, LeadActivity.actor, LeadActivity.createdAt, LeadActivity.leadId)
    if not is_staff:
        activity_query = activity_query.where(LeadActivity.leadId.in_(select(Lead.id).where(Lead.brokerId == scope_id)))
    recent_rows = db.execute(activity_query.order_by(LeadActivity.createdAt.desc()).limit(8)).all()

    property_titles = {
        pid: title
        for pid, title in db.execute(select(Property.id, Property.title).where(Property.id.in_([r.propertyId for r in at_risk_rows if r.propertyId]))).all()
    }
    broker_names = {
        bid: name for bid, name in db.execute(select(Broker.id, Broker.name).where(Broker.id.in_([r.brokerId for r in at_risk_rows if r.brokerId]))).all()
    }
    lead_names = {
        lid: name for lid, name in db.execute(select(Lead.id, Lead.name).where(Lead.id.in_([r.leadId for r in recent_rows]))).all()
    }

    current = [l for l in leads if l.createdAt >= now - 30 * DAY]
    previous = [l for l in leads if l.createdAt < now - 30 * DAY]

    days = [(now - i * DAY).date().isoformat() for i in range(29, -1, -1)]
    by_day = {d: {"leads": 0, "won": 0, "respMin": 0.0, "resp": 0} for d in days}
    for l in current:
        row = by_day.get(l.createdAt.date().isoformat())
        if row is None:
            continue
        row["leads"] += 1
        if l.status == "WON":
            row["won"] += 1
        if l.firstResponseAt:
            row["resp"] += 1
            row["respMin"] += _minutes(l)
    series = [
        {"date": d, "leads": by_day[d]["leads"], "won": by_day[d]["won"], "response": js_round(by_day[d]["respMin"] / by_day[d]["resp"]) if by_day[d]["resp"] else None}
        for d in days
    ]

    status_counts = [{"status": s, "count": sum(1 for l in current if l.status == s)} for s in LEAD_STATUSES]
    source_counts = [c for c in ({"source": s, "count": sum(1 for l in current if l.source == s)} for s in LEAD_SOURCES) if c["count"]]

    leaderboard = []
    for b in brokers:
        mine = [l for l in current if l.brokerId == b.id]
        leaderboard.append(
            {
                "id": b.id, "name": b.name, "photoUrl": b.photoUrl, "title": b.title, "capacity": b.capacity,
                "leads": len(mine), "won": sum(1 for l in mine if l.status == "WON"), "open": open_by_broker.get(b.id, 0), "avgResponse": _avg_response(mine),
            }
        )
    leaderboard.sort(key=lambda b: (-b["won"], -b["leads"]))

    win_now = _win_rate(current)
    return {
        "kpis": {
            "leads": {"value": len(current), "delta": _delta(len(current), len(previous)), "spark": [s["leads"] for s in series]},
            "response": {"value": _avg_response(current), "delta": None, "spark": [s["response"] or 0 for s in series]},
            "winRate": {"value": win_now, "delta": win_now - _win_rate(previous), "spark": [s["won"] for s in series]},
            "listings": {"value": len(properties), "views": sum(p.views for p in properties)},
        },
        "series": series,
        "statusCounts": status_counts,
        "sourceCounts": source_counts,
        "leaderboard": leaderboard,
        "atRisk": [
            {
                "id": l.id, "name": l.name, "property": property_titles.get(l.propertyId), "broker": broker_names.get(l.brokerId),
                "slaDueAt": iso(l.slaDueAt), "escalated": l.escalated,
            }
            for l in at_risk_rows
        ],
        "recent": [
            {"id": a.id, "type": a.type, "note": a.note, "actor": a.actor, "at": iso(a.createdAt), "leadId": a.leadId, "leadName": lead_names.get(a.leadId)}
            for a in recent_rows
        ],
        "topProperties": [
            {"id": p.id, "title": p.title, "views": p.views, "image": _first_image_url(p.images)}
            for p in sorted(properties, key=lambda p: -p.views)[:5]
        ],
    }
