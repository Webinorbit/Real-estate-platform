"""Broker routing engine: pure functions, no I/O.

Given a lead (+ property), the tenant's rules and the broker roster, decide who gets the lead and return a full
trace explaining why. The service layer persists the trace as the audit log.

Plain dicts in, plain dicts out, so the engine is trivial to test and to reason about.
"""

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.geo import point_in_territory, point_in_polygon
from app.constants import OPEN_STATUSES  # noqa: F401  (re-exported for callers)

DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


def _norm(value: Any) -> str:
    return str("" if value is None else value).strip().lower()


def _in_list(items, value) -> bool:
    return any(_norm(x) == _norm(value) for x in items)


def _utc(now: datetime | None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)


def _ts(value) -> float:
    if not value:
        return 0.0
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def local_clock(now: datetime, tz_name: str | None) -> dict:
    """Local weekday + minutes-since-midnight in an IANA timezone (falls back to UTC for unknown zones)."""
    now = _utc(now)
    try:
        local = now.astimezone(ZoneInfo(tz_name or "UTC"))
    except Exception:
        local = now
    return {"day": DAY_KEYS[(local.weekday() + 1) % 7], "minutes": local.hour * 60 + local.minute}


def _to_minutes(hhmm: str) -> int:
    parts = str(hhmm).split(":")
    return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 and parts[1] else 0)


def is_broker_available(broker: dict, now: datetime | None = None) -> bool:
    """`workingHours` None = always available. A day set to None = day off."""
    wh = broker.get("workingHours")
    if not isinstance(wh, dict):
        return True
    clock = local_clock(now or datetime.now(timezone.utc), broker.get("timezone"))
    slot = wh.get(clock["day"])
    if not slot:
        return False
    start, end = slot
    return _to_minutes(start) <= clock["minutes"] < _to_minutes(end)


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _present(v) -> bool:
    return v is not None and v != ""


def match_rule(rule: dict, lead: dict, property: dict | None) -> dict:
    """Does a rule's condition set match this lead / property? Returns the checks that passed or failed."""
    c = rule.get("conditions") or {}
    passed: list[str] = []
    failed: list[str] = []

    def check(ok, ok_msg, fail_msg):
        (passed if ok else failed).append(ok_msg if ok else fail_msg)

    p = property or {}
    na = lambda v: "n/a" if v is None else v  # noqa: E731

    if c.get("listingTypes"):
        check(property and p.get("listingType") in c["listingTypes"], f"listing is {p.get('listingType')}", f"listing type {na(p.get('listingType'))} not in [{','.join(c['listingTypes'])}]")
    if c.get("propertyTypes"):
        check(property and p.get("type") in c["propertyTypes"], f"property type is {p.get('type')}", f"property type {na(p.get('type'))} not in [{','.join(c['propertyTypes'])}]")

    value = p.get("price") if p.get("price") is not None else lead.get("budget")
    if _present(c.get("minPrice")):
        check(value is not None and value >= float(c["minPrice"]), f"price >= {c['minPrice']}", f"price {na(value)} below {c['minPrice']}")
    if _present(c.get("maxPrice")):
        check(value is not None and value <= float(c["maxPrice"]), f"price <= {c['maxPrice']}", f"price {na(value)} above {c['maxPrice']}")
    if c.get("cities"):
        check(property and _in_list(c["cities"], p.get("city")), f"city is {p.get('city')}", f"city {na(p.get('city'))} not in [{','.join(c['cities'])}]")
    if c.get("localities"):
        check(property and _in_list(c["localities"], p.get("locality")), f"locality is {p.get('locality')}", f"locality {na(p.get('locality'))} not in [{','.join(c['localities'])}]")
    if c.get("languages"):
        check(lead.get("language") and _in_list(c["languages"], lead["language"]), f"lead speaks {lead.get('language')}", f"lead language {na(lead.get('language'))} not in [{','.join(c['languages'])}]")
    if c.get("sources"):
        check(lead.get("source") in c["sources"], f"source is {lead.get('source')}", f"source {lead.get('source')} not in [{','.join(c['sources'])}]")
    if c.get("polygon"):
        inside = bool(property) and _num(p.get("lat")) is not None and point_in_polygon(p["lng"], p["lat"], c["polygon"])
        check(inside, "property inside the rule's map area", "property outside the rule's map area")
    return {"matched": not failed, "passed": passed, "failed": failed}


def _broker_covers(broker: dict, property: dict | None) -> bool:
    if not property:
        return False
    areas = broker.get("areas") or []
    if areas and (_in_list(areas, property.get("locality")) or _in_list(areas, property.get("city"))):
        return True
    if broker.get("territory") and _num(property.get("lat")) is not None:
        return point_in_territory(property["lng"], property["lat"], broker["territory"])
    return False


def _assigned_key(b: dict):
    return (_ts(b.get("lastAssignedAt")), str(b.get("id")))


def pick_broker(strategy: str, candidates: list[dict], property: dict | None = None) -> dict:
    """Applies a strategy to already-eligible candidates. Never mutates the input."""
    if not candidates:
        return {"broker": None, "note": "no candidates"}
    pool = list(candidates)

    if strategy == "LEAST_LOADED":
        pool.sort(key=lambda b: (b["load"], *_assigned_key(b)))
        return {"broker": pool[0], "note": f"lowest open-lead load ({pool[0]['load']})"}
    if strategy == "WEIGHTED":
        score = lambda b: (b["load"] + 1) / max(1, b.get("weight") or 1)  # noqa: E731
        pool.sort(key=lambda b: (score(b), *_assigned_key(b)))
        return {"broker": pool[0], "note": f"best weighted share (weight {pool[0].get('weight')}, load {pool[0]['load']})"}
    if strategy == "LISTING_AGENT":
        owner_id = (property or {}).get("listingBrokerId")
        own = next((b for b in pool if owner_id and b["id"] == owner_id), None)
        if own:
            return {"broker": own, "note": "listing agent is available"}
        pool.sort(key=_assigned_key)
        return {"broker": pool[0], "note": "listing agent unavailable, fell back to round robin"}
    pool.sort(key=_assigned_key)
    return {"broker": pool[0], "note": "waited longest since last assignment"}


def _describe(b: dict, **extra) -> dict:
    return {"brokerId": b["id"], "name": b.get("name"), "load": b["load"], "capacity": b["capacity"], **extra}


def route_lead(lead: dict, property: dict | None = None, rules: list[dict] | None = None, brokers: list[dict] | None = None,
               now: datetime | None = None, exclude_broker_ids=(), sla_default: int = 15) -> dict:
    """Core entry point. Returns the chosen broker (or None), the rule, strategy, reasons, candidates and a trace."""
    rules = rules or []
    brokers = brokers or []
    now = now or datetime.now(timezone.utc)
    excluded = set(exclude_broker_ids or ())
    trace: list[dict] = []
    ordered = sorted((r for r in rules if r.get("enabled") is not False), key=lambda r: r["priority"])
    baseline = [b for b in brokers if b.get("active") is not False and b["id"] not in excluded]

    for rule in ordered:
        m = match_rule(rule, lead, property)
        if not m["matched"]:
            trace.append({"ruleId": rule["id"], "ruleName": rule["name"], "outcome": "skipped", "detail": "; ".join(m["failed"])})
            continue

        wanted = rule.get("brokerIds") or []
        pool = [b for b in baseline if b["id"] in wanted] if wanted else baseline
        candidates: list[dict] = []
        considered = []
        for b in pool:
            why = []
            if b["load"] >= b["capacity"]:
                why.append(f"at capacity ({b['load']}/{b['capacity']})")
            if rule.get("requireAvailable") is not False and not is_broker_available(b, now):
                why.append("outside working hours")
            if rule.get("matchLanguage") and lead.get("language") and not _in_list(b.get("languages") or [], lead["language"]):
                why.append(f"does not speak {lead['language']}")
            if rule.get("useTerritory") and not _broker_covers(b, property):
                why.append("territory does not cover this property")
            if not why:
                candidates.append(b)
            considered.append(_describe(b, eligible=not why, why=", ".join(why) or "eligible"))

        matched_text = ", ".join(m["passed"]) or "all leads"
        if not candidates:
            trace.append({"ruleId": rule["id"], "ruleName": rule["name"], "outcome": "no-eligible-broker", "detail": f"matched ({matched_text}) but no broker was eligible"})
            continue

        picked = pick_broker(rule["strategy"], candidates, property)
        trace.append({"ruleId": rule["id"], "ruleName": rule["name"], "outcome": "selected", "detail": f"matched ({matched_text})"})
        broker = picked["broker"]
        return {
            "brokerId": broker["id"], "broker": broker, "rule": {"id": rule["id"], "name": rule["name"]},
            "strategy": rule["strategy"], "fallback": False,
            "slaMinutes": rule["slaMinutes"] if rule.get("slaMinutes") is not None else sla_default,
            "reasons": [f"Rule \"{rule['name']}\" matched: {', '.join(m['passed']) or 'applies to all leads'}.", f"Strategy {rule['strategy']}: {picked['note']}."],
            "candidates": considered, "trace": trace,
        }

    # Default pool: progressively relax constraints so a lead is never silently dropped.
    tiers = [
        ("available brokers with spare capacity", lambda b: b["load"] < b["capacity"] and is_broker_available(b, now)),
        ("on-call brokers (outside working hours) with spare capacity", lambda b: b["load"] < b["capacity"]),
        ("all active brokers (everyone is at capacity)", lambda b: True),
    ]
    for index, (label, test) in enumerate(tiers):
        candidates = [b for b in baseline if test(b)]
        if not candidates:
            continue
        strategy = "LEAST_LOADED" if index == 2 else "ROUND_ROBIN"
        picked = pick_broker(strategy, candidates, property)
        broker = picked["broker"]
        return {
            "brokerId": broker["id"], "broker": broker, "rule": None, "strategy": strategy, "fallback": True, "slaMinutes": sla_default,
            "reasons": ["No routing rule produced an eligible broker." if ordered else "No routing rules apply.", f"Default pool ({label}), {strategy}: {picked['note']}."],
            "candidates": [_describe(b, eligible=bool(test(b)), why="eligible" if test(b) else "excluded by default pool tier") for b in baseline],
            "trace": trace,
        }

    return {
        "brokerId": None, "broker": None, "rule": None, "strategy": None, "fallback": True, "unassigned": True, "slaMinutes": sla_default,
        "reasons": ["No active brokers are available. The lead is unassigned and escalated to the account owner."],
        "candidates": [], "trace": trace,
    }
