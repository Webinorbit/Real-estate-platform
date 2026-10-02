"""Lead lifecycle on top of the routing engine: create + route, status changes, manual assignment, SLA worker."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.constants import OPEN_STATUSES
from app.db import SessionLocal, bind_tenant, engine
from app.errors import UserError
from app.models import Assignment, Broker, Lead, LeadActivity, Property, RoutingRule, Tenant, User, utcnow
from app.notify import fire_and_forget, fire_webhook, notify_escalation, notify_lead_assigned
from app.plans import can
from app.routing.engine import route_lead
from app.serialize import plain, ser

log = logging.getLogger("routing")


def property_for_routing(p: Property | None) -> dict | None:
    if p is None:
        return None
    return {
        "id": p.id, "title": p.title, "type": p.type, "listingType": p.listingType, "price": p.price, "city": p.city,
        "locality": p.locality, "lat": p.lat, "lng": p.lng, "listingBrokerId": p.listingBrokerId,
    }


def lead_for_routing(lead: Lead) -> dict:
    return {"id": lead.id, "source": lead.source, "language": lead.language, "budget": lead.budget, "escalated": lead.escalated, "reassignCount": lead.reassignCount}


def tenant_snapshot(tenant: Tenant) -> dict:
    """Plain copy safe to hand to background threads."""
    return ser(tenant)


def public_broker_card(b: dict | None) -> dict | None:
    if not b:
        return None
    return {k: b.get(k) for k in ("id", "name", "title", "photoUrl", "phone", "languages")}


def load_routing_context(db: Session, tenant: Tenant) -> dict:
    """Rules + broker roster (with live open-lead load) for one tenant. `db` must be bound to that tenant."""
    rules = db.scalars(select(RoutingRule).order_by(RoutingRule.priority.asc())).all() if can(tenant, "routingRules") else []
    brokers = db.scalars(select(Broker).where(Broker.active.is_(True))).all()
    loads = dict(
        db.execute(
            select(Lead.brokerId, func.count(Lead.id)).where(Lead.status.in_(OPEN_STATUSES), Lead.brokerId.is_not(None)).group_by(Lead.brokerId)
        ).all()
    )
    return {
        "rules": [ser(r) for r in rules],
        "brokers": [ser(b, load=loads.get(b.id, 0)) for b in brokers],
    }


def simulate_routing(db: Session, tenant: Tenant, *, property_id=None, source="ENQUIRY", language=None, budget=None, now=None) -> dict:
    """Dry-run: same decision path as a real lead, nothing is written. Used by the rule tester."""
    ctx = load_routing_context(db, tenant)
    prop = None
    if property_id:
        prop = property_for_routing(db.scalars(select(Property).where(Property.id == property_id)).first())
    lead = {"source": source or "ENQUIRY", "language": language or None, "budget": budget}
    result = route_lead(lead, prop, ctx["rules"], ctx["brokers"], now or datetime.now(timezone.utc), sla_default=tenant.slaMinutes)
    return plain({**result, "broker": public_broker_card(result["broker"]), "property": prop})


def _persist_assignment(db: Session, tenant: Tenant, lead: Lead, route: dict, kind: str, actor: str | None) -> datetime | None:
    now = utcnow()
    sla_on = can(tenant, "slaAutomation")
    sla_due = now + timedelta(minutes=route["slaMinutes"]) if route["brokerId"] and sla_on else None

    lead.brokerId = route["brokerId"]
    lead.assignedAt = now if route["brokerId"] else None
    lead.slaDueAt = sla_due
    lead.escalated = bool(route.get("unassigned")) or (True if kind == "ESCALATE" else bool(lead.escalated))
    if kind == "REASSIGN":
        lead.reassignCount = (lead.reassignCount or 0) + 1
    if route["brokerId"]:
        db.execute(update(Broker).where(Broker.id == route["brokerId"]).values(lastAssignedAt=now))

    rule = route.get("rule")
    db.add(
        Assignment(
            leadId=lead.id, brokerId=route["brokerId"], ruleId=rule["id"] if rule else None,
            ruleName=rule["name"] if rule else ("Default pool" if route.get("fallback") else None),
            strategy=route.get("strategy"), kind=kind, reasons=route["reasons"],
            candidates={"candidates": plain(route["candidates"]), "trace": plain(route["trace"])},
        )
    )
    reasons = " ".join(route["reasons"])
    db.add(
        LeadActivity(
            leadId=lead.id, type="ASSIGNED" if kind == "INITIAL" else kind, actor=actor or "system",
            note=f"{route['broker']['name']}: {reasons}" if route["brokerId"] else reasons,
        )
    )
    return sla_due


def create_and_route_lead(db: Session, tenant: Tenant, data: dict) -> dict:
    """Creates a lead from a public form and routes it through the tenant's rules."""
    prop = None
    if data.get("propertyId"):
        prop = db.scalars(select(Property).where(Property.id == data["propertyId"])).first()
        if not prop:
            raise UserError("Property not found")

    lead = Lead(
        propertyId=prop.id if prop else None, source=data.get("source") or "ENQUIRY", name=data["name"], email=data["email"],
        phone=data.get("phone") or None, message=data.get("message") or None, language=data.get("language") or None,
        budget=data.get("budget"), preferredAt=data.get("preferredAt"),
    )
    db.add(lead)
    db.flush()
    db.add(LeadActivity(leadId=lead.id, type="CREATED", actor="visitor", note=f"Source: {lead.source}"))

    ctx = load_routing_context(db, tenant)
    route = route_lead(lead_for_routing(lead), property_for_routing(prop), ctx["rules"], ctx["brokers"], sla_default=tenant.slaMinutes)
    sla_due = _persist_assignment(db, tenant, lead, route, "INITIAL", "system")

    owner = db.scalars(select(User).where(User.tenantId == tenant.id, User.role == "OWNER").limit(1)).first() if route.get("unassigned") else None
    db.commit()

    snapshot = tenant_snapshot(tenant)
    lead_data = ser(lead)
    prop_data = {"id": prop.id, "title": prop.title} if prop else None
    broker_card = public_broker_card(route["broker"])
    fire_and_forget(notify_lead_assigned, snapshot, lead_data, route["broker"], prop_data)
    if route.get("unassigned"):
        fire_and_forget(notify_escalation, snapshot, lead_data, owner.email if owner else None)
    fire_and_forget(fire_webhook, snapshot, "lead.created", plain({"lead": lead_data, "property": prop_data, "broker": broker_card}))
    return {"lead": lead_data, "broker": broker_card, "reasons": route["reasons"], "slaMinutes": route["slaMinutes"], "slaDueAt": plain(sla_due)}


def _get_lead(db: Session, lead_id: str) -> Lead:
    lead = db.scalars(select(Lead).where(Lead.id == lead_id)).first()
    if not lead:
        raise UserError("Lead not found", 404)
    return lead


def set_lead_status(db: Session, tenant: Tenant, lead_id: str, status: str, actor: str | None = None, note: str | None = None, lost_reason: str | None = None) -> Lead:
    """Moves a lead through the pipeline; the first move off NEW stops the SLA clock."""
    lead = _get_lead(db, lead_id)
    if lead.status == status:
        return lead
    previous = lead.status
    lead.status = status
    if status != "NEW" and not lead.firstResponseAt:
        lead.firstResponseAt = utcnow()
        lead.slaDueAt = None
    if status == "LOST":
        lead.lostReason = lost_reason or lead.lostReason or None
    db.add(LeadActivity(leadId=lead.id, type="STATUS", actor=actor or "system", note=f"{previous} → {status}" + (f": {note}" if note else "")))
    db.commit()
    fire_and_forget(fire_webhook, tenant_snapshot(tenant), "lead.status", {"id": lead.id, "from": previous, "to": status})
    return lead


def add_lead_note(db: Session, lead_id: str, note: str, actor: str | None) -> LeadActivity:
    lead = _get_lead(db, lead_id)
    activity = LeadActivity(leadId=lead.id, type="NOTE", note=note, actor=actor)
    db.add(activity)
    db.commit()
    return activity


def assign_lead_manually(db: Session, tenant: Tenant, lead_id: str, broker_id: str, actor: str) -> Broker:
    lead = _get_lead(db, lead_id)
    broker = db.scalars(select(Broker).where(Broker.id == broker_id)).first()
    if not broker:
        raise UserError("Lead or broker not found", 404)
    broker_data = ser(broker)
    route = {
        "brokerId": broker.id, "broker": broker_data, "rule": None, "strategy": None, "fallback": False, "slaMinutes": tenant.slaMinutes,
        "reasons": [f"Manually assigned to {broker.name} by {actor}."], "candidates": [], "trace": [],
    }
    _persist_assignment(db, tenant, lead, route, "MANUAL", actor)
    prop = db.scalars(select(Property).where(Property.id == lead.propertyId)).first() if lead.propertyId else None
    db.commit()
    fire_and_forget(notify_lead_assigned, tenant_snapshot(tenant), ser(lead), broker_data, {"id": prop.id, "title": prop.title} if prop else None, True)
    return broker


def process_sla_breaches(now: datetime | None = None) -> dict:
    """SLA worker. For every tenant whose plan includes SLA automation, finds leads still NEW after their deadline,
    reassigns them to a broker that has not had them yet, and escalates once the reassign budget is spent."""
    if now is None:
        now_naive = utcnow()
    elif now.tzinfo is None:
        now_naive = now
    else:
        now_naive = now.astimezone(timezone.utc).replace(tzinfo=None)
    now_aware = now_naive.replace(tzinfo=timezone.utc)

    with SessionLocal() as probe:
        due = probe.execute(
            select(Lead.id, Lead.tenantId)
            .where(Lead.status == "NEW", Lead.slaDueAt <= now_naive, Lead.brokerId.is_not(None))
            .order_by(Lead.slaDueAt.asc())
            .limit(100)
        ).all()

    summary = {"checked": len(due), "reassigned": 0, "escalated": 0, "skipped": 0}
    tenants: dict[str, dict | None] = {}

    for lead_id, tenant_id in due:
        with SessionLocal() as db:
            tenant = db.get(Tenant, tenant_id)
            if tenant is None or not tenant.active or not can(tenant, "slaAutomation"):
                summary["skipped"] += 1
                continue
            bind_tenant(db, tenant.id)
            try:
                lead = db.scalars(select(Lead).where(Lead.id == lead_id)).first()
                if lead is None or lead.status != "NEW":
                    continue
                prop = db.scalars(select(Property).where(Property.id == lead.propertyId)).first() if lead.propertyId else None
                tried = [b for (b,) in db.execute(select(Assignment.brokerId).where(Assignment.leadId == lead.id)).all() if b]
                breached = db.scalars(select(Broker).where(Broker.id == lead.brokerId)).first()
                breached_name = breached.name if breached else "Broker"

                db.add(LeadActivity(leadId=lead.id, type="SLA_BREACH", actor="system", note=f"{breached_name} did not respond within the SLA."))

                route = None
                if (lead.reassignCount or 0) < tenant.maxReassigns:
                    ctx = load_routing_context(db, tenant)
                    candidate = route_lead(lead_for_routing(lead), property_for_routing(prop), ctx["rules"], ctx["brokers"], now_aware, exclude_broker_ids=tried, sla_default=tenant.slaMinutes)
                    if candidate["brokerId"]:
                        route = candidate

                snapshot = tenant_snapshot(tenant)
                prop_data = {"id": prop.id, "title": prop.title} if prop else None
                if route:
                    route["reasons"].insert(0, f"SLA breached by {breached.name if breached else 'previous broker'}; reassigned.")
                    _persist_assignment(db, tenant, lead, route, "REASSIGN", "sla-worker")
                    db.commit()
                    fire_and_forget(notify_lead_assigned, snapshot, ser(lead), route["broker"], prop_data, True)
                    fire_and_forget(fire_webhook, snapshot, "lead.reassigned", {"id": lead.id, "to": route["brokerId"]})
                    summary["reassigned"] += 1
                else:
                    owner = db.scalars(select(User).where(User.tenantId == tenant.id, User.role == "OWNER").limit(1)).first()
                    lead.escalated = True
                    lead.slaDueAt = None
                    db.add(Assignment(leadId=lead.id, brokerId=lead.brokerId, ruleName="SLA escalation", kind="ESCALATE",
                                      reasons=["Reassign budget exhausted or no untried broker available. Escalated to the account owner."]))
                    db.add(LeadActivity(leadId=lead.id, type="ESCALATE", actor="sla-worker", note="Escalated to the account owner."))
                    db.commit()
                    fire_and_forget(notify_escalation, snapshot, ser(lead), owner.email if owner else None)
                    fire_and_forget(fire_webhook, snapshot, "lead.escalated", {"id": lead.id})
                    summary["escalated"] += 1
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("[sla] failed for lead %s", lead_id)
    return summary


SLA_LOCK_KEY = 727001


def process_sla_breaches_locked() -> dict | None:
    """Runs the SLA pass under a Postgres advisory lock so several API workers never process the same leads."""
    with engine.connect() as conn:
        got = conn.execute(select(func.pg_try_advisory_lock(SLA_LOCK_KEY))).scalar()
        if not got:
            return None
        try:
            return process_sla_breaches()
        finally:
            conn.execute(select(func.pg_advisory_unlock(SLA_LOCK_KEY)))
