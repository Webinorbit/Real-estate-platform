"""Admin API: lead routing console (port of src/app/admin/(panel)/routing/*).

Every endpoint requires a signed-in OWNER/ADMIN (SUPER passes) on a plan that includes "routingRules"
(anonymous -> 401, broker -> 403, Starter -> 403 {"error", "code": "plan_locked", "feature": "routingRules"}).
Validation problems answer 400 {"error": "<first problem>"}; unknown ids answer 404 {"error": "Rule not found"}.
Mutations answer {"ok": true, ...}. Dates are ISO-8601 strings.

GET    /api/admin/routing
       -> {"rules": [{"id","name","priority","enabled","conditions" ({} when null),"strategy","brokerIds","requireAvailable",
                      "matchLanguage","useTerritory","slaMinutes"}]                       (ordered by priority asc),
           "brokers": [{"id","name","photoUrl"}]                                           (active brokers, by name),
           "properties": [{"id","title"}]                                                  (ACTIVE properties, by title, max 200),
           "audit": [{"id","createdAt" (ISO),"leadId","leadName" ("Lead" fallback),"kind","brokerName"|null,"ruleName",
                      "strategy","reasons": [str]}]                                        (latest 40 assignments),
           "mapCenter": [mapLng, mapLat], "currency", "locale",
           "allowSla": bool                                                                (plan has slaAutomation),
           "slaMinutes": int, "maxReassigns": int}                                         (page header: "SLA: x min · y reassigns")

POST   /api/admin/routing/rules                     (saveRule, create; priority = highest existing + 10)
PUT    /api/admin/routing/rules/{rule_id}           (saveRule, update; priority untouched)
       body {"name": str(2..80, "Name the rule"), "enabled"?: bool=true,
             "strategy": "ROUND_ROBIN"|"LEAST_LOADED"|"WEIGHTED"|"LISTING_AGENT", "brokerIds"?: [str(<=40)] (<=200),
             "requireAvailable"?: bool=true, "matchLanguage"?: bool=false, "useTerritory"?: bool=false,
             "slaMinutes"?: int 1..1440 | ""/null,
             "conditions": {"listingTypes"?: ["SALE"|"RENT"], "propertyTypes"?: [PROPERTY_TYPE], "minPrice"?: num|""|null,
                            "maxPrice"?: num|""|null (0..1e13), "cities"?: [str], "localities"?: [str],
                            "languages"?: [str] (unknown languages dropped), "sources"?: [LEAD_SOURCE],
                            "polygon"?: GeoJSON Polygon|null}}
       -> {"ok": true, "id": "<rule id>"}
       Stored conditions only keep non-empty lists / non-null prices / the polygon. Errors include
       "One of the selected brokers no longer exists", "Minimum price is higher than maximum price",
       "Map area must have at least three points", 404 "Rule not found".

PUT    /api/admin/routing/rules/{rule_id}/enabled   (toggleRule)  body {"enabled": bool}   -> {"ok": true}
DELETE /api/admin/routing/rules/{rule_id}           (deleteRule)                            -> {"ok": true}
POST   /api/admin/routing/rules/reorder             (reorderRules)  body {"ids": [ruleId, ...]} -> {"ok": true}
       ids must list every rule of the tenant exactly once; priorities become 10, 20, 30... in that order
       ("Invalid rule order" otherwise).

POST   /api/admin/routing/simulate                  (runSimulation; dry run, nothing is written)
       body {"propertyId"?: str|"", "source"?: LEAD_SOURCE (default ENQUIRY), "language"?: str|"", "budget"?: num|""|null,
             "now"?: ISO-8601 string|null}          ("Invalid date" when `now` does not parse)
       -> {"ok": true, "result": {"brokerId","broker": {id,name,title,photoUrl,phone,languages}|null,"rule": {id,name}|null,
            "strategy","fallback","unassigned"?,"slaMinutes","reasons": [str],"candidates": [...],"trace": [...],
            "property": {...}|null}}
"""

import math
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import func, select

from app.constants import LANGUAGES, LEAD_SOURCES, PROPERTY_TYPES, STRATEGIES
from app.deps import STAFF, AdminCtx, authed
from app.errors import NotFound, UserError
from app.models import Assignment, Broker, Lead, Property, RoutingRule
from app.plans import can
from app.routing.service import simulate_routing
from app.serialize import iso
from app.zlike import (
    js_number, opt_num, truthy, z_array, z_bool, z_enum, z_number, z_string, invalid_type,
)

router = APIRouter(prefix="/api/admin/routing")

routing_ctx = authed(STAFF, "routingRules")


def _rule_json(r: RoutingRule) -> dict:
    return {
        "id": r.id, "name": r.name, "priority": r.priority, "enabled": r.enabled, "conditions": r.conditions or {},
        "strategy": r.strategy, "brokerIds": list(r.brokerIds or []), "requireAvailable": r.requireAvailable,
        "matchLanguage": r.matchLanguage, "useTerritory": r.useTerritory, "slaMinutes": r.slaMinutes,
    }


@router.get("")
def routing_page(ctx: AdminCtx = Depends(routing_ctx)):
    db, tenant = ctx.db, ctx.tenant
    rules = db.scalars(select(RoutingRule).order_by(RoutingRule.priority.asc(), RoutingRule.id.asc())).all()
    brokers = db.execute(select(Broker.id, Broker.name, Broker.photoUrl).where(Broker.active.is_(True)).order_by(Broker.name.asc())).all()
    properties = db.execute(select(Property.id, Property.title).where(Property.status == "ACTIVE").order_by(Property.title.asc()).limit(200)).all()
    audit = db.execute(
        select(Assignment, Lead.name, Broker.name)
        .outerjoin(Lead, Lead.id == Assignment.leadId)
        .outerjoin(Broker, Broker.id == Assignment.brokerId)
        .order_by(Assignment.createdAt.desc(), Assignment.id.desc())
        .limit(40)
    ).all()
    return {
        "rules": [_rule_json(r) for r in rules],
        "brokers": [{"id": b.id, "name": b.name, "photoUrl": b.photoUrl} for b in brokers],
        "properties": [{"id": p.id, "title": p.title} for p in properties],
        "audit": [
            {
                "id": a.id, "createdAt": iso(a.createdAt), "leadId": a.leadId, "leadName": lead_name or "Lead", "kind": a.kind,
                "brokerName": broker_name or None, "ruleName": a.ruleName, "strategy": a.strategy,
                "reasons": a.reasons if isinstance(a.reasons, list) else [],
            }
            for a, lead_name, broker_name in audit
        ],
        "mapCenter": [tenant.mapLng, tenant.mapLat],
        "currency": tenant.currency,
        "locale": tenant.locale,
        "allowSla": can(tenant, "slaAutomation"),
        "slaMinutes": tenant.slaMinutes,
        "maxReassigns": tenant.maxReassigns,
    }


def _str_list(v: Any, max_items: int = 40, default_missing: bool = True) -> list[str]:
    """z.array(z.string().trim().min(1).max(80)).max(n).default([])"""
    if v is None:
        if default_missing:
            return []
        raise invalid_type("array", v)
    z_array(v, max_items)
    return [z_string(x, 1, 80) for x in v]


def _enum_list(v: Any, options: list[str]) -> list[str]:
    if v is None:
        return []
    z_array(v)
    return [z_enum(x, options) for x in v]


def _opt_price(v: Any):
    return opt_num(v, 0, 1e13)


def _parse_rule(body: dict) -> tuple[dict, dict]:
    """Returns (rule fields, raw validated conditions) in zod's field order so the first problem matches."""

    def given(key):  # `.default(x)` only applies to undefined, so an explicit null is an error
        return key in body

    name = z_string(body.get("name"), 2, 80, "Name the rule", missing="name" not in body)
    enabled = z_bool(body["enabled"]) if given("enabled") else True
    strategy = z_enum(body.get("strategy"), STRATEGIES)

    broker_ids: list[str] = []
    if given("brokerIds"):
        z_array(body["brokerIds"], 200)
        broker_ids = [z_string_max(x, 40) for x in body["brokerIds"]]

    require_available = z_bool(body["requireAvailable"]) if given("requireAvailable") else True
    match_language = z_bool(body["matchLanguage"]) if given("matchLanguage") else False
    use_territory = z_bool(body["useTerritory"]) if given("useTerritory") else False

    sla = body.get("slaMinutes")
    sla = None if sla is None or sla == "" else z_number(js_number(sla), 1, 1440, integer=True)

    c = body.get("conditions")
    if not isinstance(c, dict):
        raise invalid_type("object", c, missing="conditions" not in body)
    conditions = {
        "listingTypes": _enum_list(c.get("listingTypes"), ["SALE", "RENT"]),
        "propertyTypes": _enum_list(c.get("propertyTypes"), PROPERTY_TYPES),
        "minPrice": _opt_price(c.get("minPrice")),
        "maxPrice": _opt_price(c.get("maxPrice")),
        "cities": _str_list(c.get("cities")),
        "localities": _str_list(c.get("localities")),
        "languages": [lang for lang in _lang_list(c.get("languages")) if lang in LANGUAGES],
        "sources": _enum_list(c.get("sources"), LEAD_SOURCES),
        "polygon": c.get("polygon"),
    }
    fields = {
        "name": name, "enabled": enabled, "strategy": strategy, "brokerIds": broker_ids, "requireAvailable": require_available,
        "matchLanguage": match_language, "useTerritory": use_territory, "slaMinutes": sla,
    }
    return fields, conditions


def z_string_max(v: Any, max_len: int) -> str:
    """z.string().max(n) (no trim, no min)."""
    if not isinstance(v, str):
        raise invalid_type("string", v)
    if len(v) > max_len:
        raise UserError(f"Too big: expected string to have <={max_len} characters")
    return v


def _lang_list(v: Any) -> list[str]:
    if v is None:
        return []
    z_array(v)
    for x in v:
        if not isinstance(x, str):
            raise invalid_type("string", x)
    return v


def _finite(n: Any) -> bool:
    return isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)


def clean_conditions(c: dict) -> dict:
    out: dict = {}
    for k in ("listingTypes", "propertyTypes", "cities", "localities", "languages", "sources"):
        if c.get(k):
            out[k] = c[k]
    if c.get("minPrice") is not None:
        out["minPrice"] = c["minPrice"]
    if c.get("maxPrice") is not None:
        out["maxPrice"] = c["maxPrice"]
    if c.get("minPrice") is not None and c.get("maxPrice") is not None and c["minPrice"] > c["maxPrice"]:
        raise UserError("Minimum price is higher than maximum price")
    poly = c.get("polygon")
    if truthy(poly):
        ring = None
        if isinstance(poly, dict) and poly.get("type") == "Polygon":
            coords = poly.get("coordinates")
            ring = coords[0] if isinstance(coords, list) and coords else None
        if (
            not isinstance(ring, list) or len(ring) < 4
            or not all(isinstance(p, list) and len(p) == 2 and all(_finite(n) for n in p) for p in ring)
        ):
            raise UserError("Map area must have at least three points")
        out["polygon"] = poly
    return out


def _save_rule(ctx: AdminCtx, rule_id: str | None, body: Any) -> dict:
    db = ctx.db
    if not isinstance(body, dict):
        raise invalid_type("object", body)
    fields, conditions = _parse_rule(body)
    if fields["brokerIds"]:
        found = db.scalar(select(func.count(Broker.id)).where(Broker.id.in_(fields["brokerIds"])))
        if found != len(fields["brokerIds"]):
            raise UserError("One of the selected brokers no longer exists")
    fields["conditions"] = clean_conditions(conditions)

    if rule_id:
        rule = db.scalars(select(RoutingRule).where(RoutingRule.id == rule_id)).first()
        if not rule:
            raise NotFound("Rule not found")
        for k, v in fields.items():
            setattr(rule, k, v)
    else:
        last = db.scalar(select(func.max(RoutingRule.priority)))
        rule = RoutingRule(**fields, priority=(last or 0) + 10)
        db.add(rule)
    db.commit()
    return {"ok": True, "id": rule.id}


@router.post("/rules")
def create_rule(body: Any = Body(default_factory=dict), ctx: AdminCtx = Depends(routing_ctx)):
    return _save_rule(ctx, None, body)


@router.post("/rules/reorder")
def reorder_rules(body: Any = Body(default=None), ctx: AdminCtx = Depends(routing_ctx)):
    db = ctx.db
    ids = body.get("ids") if isinstance(body, dict) else body
    rules = {r.id: r for r in db.scalars(select(RoutingRule)).all()}
    if not isinstance(ids, list) or len(ids) != len(rules) or any(not isinstance(i, str) or i not in rules for i in ids) or len(set(ids)) != len(ids):
        raise UserError("Invalid rule order")
    for i, rid in enumerate(ids):
        rules[rid].priority = (i + 1) * 10
    db.commit()
    return {"ok": True}


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, body: Any = Body(default_factory=dict), ctx: AdminCtx = Depends(routing_ctx)):
    return _save_rule(ctx, rule_id, body)


def _rule_or_404(ctx: AdminCtx, rule_id: str) -> RoutingRule:
    rule = ctx.db.scalars(select(RoutingRule).where(RoutingRule.id == rule_id)).first()
    if not rule:
        raise NotFound("Rule not found")
    return rule


@router.put("/rules/{rule_id}/enabled")
def toggle_rule(rule_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(routing_ctx)):
    rule = _rule_or_404(ctx, rule_id)
    rule.enabled = truthy(body.get("enabled"))
    ctx.db.commit()
    return {"ok": True}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, ctx: AdminCtx = Depends(routing_ctx)):
    rule = _rule_or_404(ctx, rule_id)
    ctx.db.delete(rule)
    ctx.db.commit()
    return {"ok": True}


def _parse_now(v: Any) -> datetime:
    if not truthy(v):
        return datetime.now(timezone.utc)
    try:
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return datetime.fromtimestamp(v / 1000, timezone.utc)
        s = str(v).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
    except (ValueError, OverflowError, OSError):
        raise UserError("Invalid date") from None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


@router.post("/simulate")
def run_simulation(body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(routing_ctx)):
    raw_budget = body.get("budget")
    budget = None if raw_budget is None or raw_budget == "" else js_number(raw_budget)
    now = _parse_now(body.get("now"))
    source = body.get("source")
    result = simulate_routing(
        ctx.db, ctx.tenant,
        property_id=str(body["propertyId"]) if truthy(body.get("propertyId")) else None,
        source=source if isinstance(source, str) and source in LEAD_SOURCES else "ENQUIRY",
        language=str(body["language"]) if truthy(body.get("language")) else None,
        budget=budget if budget is not None and math.isfinite(budget) else None,
        now=now,
    )
    return {"ok": True, "result": result}
