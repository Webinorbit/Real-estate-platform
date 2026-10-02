import secrets

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.db import SessionLocal, bind_tenant
from app.main import app
from app.models import RoutingRule, Tenant

PWD = "demo1234"
SKY = {"x-tenant-host": "skyline.localhost"}
HERITAGE = {"x-tenant-host": "heritage.localhost"}
URBAN = {"x-tenant-host": "urbannest.localhost"}
BASE = "/api/admin/routing"


def login(email: str, host: dict) -> TestClient:
    c = TestClient(app, headers=host)
    r = c.post("/api/auth/login", json={"email": email, "password": PWD})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo", SKY)


@pytest.fixture(scope="module")
def heritage_owner():
    return login("owner@heritage.demo", HERITAGE)


def rule_body(**over):
    body = {
        "name": f"pytest-{secrets.token_hex(3)}", "enabled": True, "strategy": "ROUND_ROBIN", "brokerIds": [], "requireAvailable": True,
        "matchLanguage": False, "useTerritory": False, "slaMinutes": "",
        "conditions": {"listingTypes": [], "propertyTypes": [], "minPrice": "", "maxPrice": "", "cities": [], "localities": [], "languages": [], "sources": [], "polygon": None},
    }
    cond = over.pop("conditions", None)
    body.update(over)
    if cond:
        body["conditions"] = {**body["conditions"], **cond}
    return body


@pytest.fixture()
def made(owner):
    ids = []

    def make(**over):
        r = owner.post(f"{BASE}/rules", json=rule_body(**over))
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
        return r.json()["id"]

    yield make
    for rid in ids:
        owner.delete(f"{BASE}/rules/{rid}")


def get_rule(c, rid):
    return next((r for r in c.get(BASE).json()["rules"] if r["id"] == rid), None)


def test_auth_and_plan_gates(owner):
    assert TestClient(app, headers=SKY).get(BASE).status_code == 401
    assert TestClient(app, headers=SKY).post(f"{BASE}/rules", json={}).status_code == 401

    broker = login("priya@skyline.demo", SKY)
    assert broker.get(BASE).status_code == 403
    assert broker.post(f"{BASE}/simulate", json={}).status_code == 403
    assert broker.delete(f"{BASE}/rules/x").status_code == 403

    starter = login("owner@urbannest.demo", URBAN)
    for res in (starter.get(BASE), starter.post(f"{BASE}/rules", json=rule_body()), starter.post(f"{BASE}/simulate", json={})):
        assert res.status_code == 403
        assert res.json()["code"] == "plan_locked" and res.json()["feature"] == "routingRules"


def test_page_data(owner):
    data = owner.get(BASE).json()
    assert {"rules", "brokers", "properties", "audit", "mapCenter", "currency", "locale", "allowSla", "slaMinutes", "maxReassigns"} <= data.keys()
    assert data["allowSla"] is True and len(data["mapCenter"]) == 2
    prios = [r["priority"] for r in data["rules"]]
    assert prios == sorted(prios)
    for r in data["rules"]:
        assert isinstance(r["conditions"], dict) and isinstance(r["brokerIds"], list)
        assert set(r) == {"id", "name", "priority", "enabled", "conditions", "strategy", "brokerIds", "requireAvailable", "matchLanguage", "useTerritory", "slaMinutes"}
    for b in data["brokers"]:
        assert set(b) == {"id", "name", "photoUrl"}
    assert len(data["properties"]) <= 200
    assert len(data["audit"]) <= 40
    for a in data["audit"]:
        assert a["createdAt"].endswith("Z") and isinstance(a["reasons"], list) and a["leadName"]
    dates = [a["createdAt"] for a in data["audit"]]
    assert dates == sorted(dates, reverse=True)


def test_tenant_isolation_of_page_data(owner, heritage_owner):
    mine = {r["id"] for r in owner.get(BASE).json()["rules"]}
    theirs = {r["id"] for r in heritage_owner.get(BASE).json()["rules"]}
    assert mine.isdisjoint(theirs)
    skyline_brokers = {b["id"] for b in owner.get(BASE).json()["brokers"]}
    assert skyline_brokers.isdisjoint({b["id"] for b in heritage_owner.get(BASE).json()["brokers"]})


def test_create_update_toggle_delete(owner, made):
    broker = owner.get(BASE).json()["brokers"][0]
    top = max([r["priority"] for r in owner.get(BASE).json()["rules"]] or [0])
    rid = made(
        name="  pytest padded  ", strategy="WEIGHTED", brokerIds=[broker["id"]], slaMinutes="30",
        conditions={"listingTypes": ["SALE"], "propertyTypes": ["VILLA"], "minPrice": "1000", "maxPrice": 5e6, "cities": [" Mumbai "], "languages": ["English", "Klingon"], "sources": ["ENQUIRY"]},
    )
    rule = get_rule(owner, rid)
    assert rule["name"] == "pytest padded" and rule["priority"] == top + 10 and rule["enabled"] is True
    assert rule["strategy"] == "WEIGHTED" and rule["brokerIds"] == [broker["id"]] and rule["slaMinutes"] == 30
    assert rule["conditions"] == {
        "listingTypes": ["SALE"], "propertyTypes": ["VILLA"], "cities": ["Mumbai"], "languages": ["English"], "sources": ["ENQUIRY"],
        "minPrice": 1000, "maxPrice": 5000000,
    }

    poly = {"type": "Polygon", "coordinates": [[[72.8, 19.0], [72.9, 19.0], [72.9, 19.1], [72.8, 19.0]]]}
    r = owner.put(f"{BASE}/rules/{rid}", json=rule_body(name="pytest renamed", strategy="LEAST_LOADED", conditions={"polygon": poly}))
    assert r.json() == {"ok": True, "id": rid}
    rule = get_rule(owner, rid)
    assert rule["name"] == "pytest renamed" and rule["strategy"] == "LEAST_LOADED" and rule["priority"] == top + 10
    assert rule["slaMinutes"] is None and rule["brokerIds"] == [] and rule["conditions"] == {"polygon": poly}

    assert owner.put(f"{BASE}/rules/{rid}/enabled", json={"enabled": False}).json() == {"ok": True}
    assert get_rule(owner, rid)["enabled"] is False
    assert owner.put(f"{BASE}/rules/{rid}/enabled", json={"enabled": True}).json() == {"ok": True}
    assert get_rule(owner, rid)["enabled"] is True

    assert owner.delete(f"{BASE}/rules/{rid}").json() == {"ok": True}
    assert get_rule(owner, rid) is None
    assert owner.delete(f"{BASE}/rules/{rid}").status_code == 404


@pytest.mark.parametrize(
    "over,message",
    [
        ({"name": "a"}, "Name the rule"),
        ({"name": "x" * 81}, "Too big: expected string to have <=80 characters"),
        ({"strategy": "RANDOM"}, 'Invalid option: expected one of "ROUND_ROBIN"|"LEAST_LOADED"|"WEIGHTED"|"LISTING_AGENT"'),
        ({"slaMinutes": 0}, "Too small: expected number to be >=1"),
        ({"slaMinutes": 2000}, "Too big: expected number to be <=1440"),
        ({"slaMinutes": 1.5}, "Invalid input: expected int, received number"),
        ({"slaMinutes": "abc"}, "Invalid input: expected number, received NaN"),
        ({"brokerIds": ["nope-not-a-broker"]}, "One of the selected brokers no longer exists"),
        ({"conditions": {"minPrice": 10, "maxPrice": 5}}, "Minimum price is higher than maximum price"),
        ({"conditions": {"minPrice": -1}}, "Too small: expected number to be >=0"),
        ({"conditions": {"listingTypes": ["LEASE"]}}, 'Invalid option: expected one of "SALE"|"RENT"'),
        ({"conditions": {"polygon": {"type": "Polygon", "coordinates": [[[1, 2], [3, 4]]]}}}, "Map area must have at least three points"),
        ({"conditions": {"polygon": {"type": "Point", "coordinates": [1, 2]}}}, "Map area must have at least three points"),
    ],
)
def test_validation_messages(owner, over, message):
    r = owner.post(f"{BASE}/rules", json=rule_body(**over))
    assert r.status_code == 400, r.text
    assert r.json()["error"] == message


def test_missing_conditions_and_bad_body(owner):
    body = rule_body()
    del body["conditions"]
    assert owner.post(f"{BASE}/rules", json=body).status_code == 400
    assert owner.put(f"{BASE}/rules/does-not-exist-123", json=rule_body()).status_code == 404


def test_defaults_when_keys_omitted(owner, made):
    rid = made(name="pytest defaults")
    r = owner.post(f"{BASE}/rules", json={"name": "pytest minimal", "strategy": "ROUND_ROBIN", "conditions": {}})
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    try:
        rule = get_rule(owner, mid)
        assert rule["enabled"] is True and rule["requireAvailable"] is True and rule["matchLanguage"] is False and rule["useTerritory"] is False
        assert rule["conditions"] == {} and rule["brokerIds"] == [] and rule["slaMinutes"] is None
    finally:
        owner.delete(f"{BASE}/rules/{mid}")
    assert get_rule(owner, rid)


def test_cross_tenant_rule_ids_not_found(owner, heritage_owner, made):
    rid = made(name="pytest isolation")
    assert heritage_owner.put(f"{BASE}/rules/{rid}", json=rule_body()).status_code == 404
    assert heritage_owner.put(f"{BASE}/rules/{rid}/enabled", json={"enabled": False}).status_code == 404
    assert heritage_owner.delete(f"{BASE}/rules/{rid}").status_code == 404
    assert get_rule(owner, rid)["enabled"] is True
    # brokers of another tenant cannot be attached either
    other_broker = heritage_owner.get(BASE).json()["brokers"][0]["id"]
    r = owner.post(f"{BASE}/rules", json=rule_body(brokerIds=[other_broker]))
    assert r.status_code == 400 and r.json()["error"] == "One of the selected brokers no longer exists"


def test_reorder(owner, made):
    a, b = made(name="pytest order a"), made(name="pytest order b")
    with SessionLocal() as db:
        tid = db.scalar(select(Tenant.id).where(Tenant.slug == "skyline"))
        bind_tenant(db, tid)
        original = {r.id: r.priority for r in db.scalars(select(RoutingRule)).all()}
    try:
        ids = [r["id"] for r in owner.get(BASE).json()["rules"]]
        assert owner.post(f"{BASE}/rules/reorder", json={"ids": ids[:-1]}).json()["error"] == "Invalid rule order"
        assert owner.post(f"{BASE}/rules/reorder", json={"ids": ids + ["zzz"]}).json()["error"] == "Invalid rule order"
        assert owner.post(f"{BASE}/rules/reorder", json={"ids": "nope"}).json()["error"] == "Invalid rule order"
        assert owner.post(f"{BASE}/rules/reorder", json={"ids": [ids[0]] * len(ids)}).json()["error"] == "Invalid rule order"

        flipped = list(reversed(ids))
        assert owner.post(f"{BASE}/rules/reorder", json={"ids": flipped}).json() == {"ok": True}
        after = owner.get(BASE).json()["rules"]
        assert [r["id"] for r in after] == flipped
        assert [r["priority"] for r in after] == [(i + 1) * 10 for i in range(len(flipped))]
        assert flipped.index(b) < flipped.index(a)
    finally:
        with SessionLocal() as db:
            for rid, prio in original.items():
                db.execute(update(RoutingRule).where(RoutingRule.id == rid).values(priority=prio))
            db.commit()


def test_simulation(owner):
    page = owner.get(BASE).json()
    prop = page["properties"][0]["id"] if page["properties"] else None
    r = owner.post(f"{BASE}/simulate", json={"propertyId": prop, "source": "ENQUIRY", "language": "", "budget": "", "now": "2026-10-05T07:30:00.000Z"})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert r.json()["ok"] is True
    assert {"brokerId", "broker", "rule", "strategy", "reasons", "candidates", "trace", "property", "slaMinutes", "fallback"} <= res.keys()
    assert res["brokerId"] and res["broker"]["id"] == res["brokerId"] and res["reasons"]
    assert res["property"]["id"] == prop
    assert set(res["broker"]) == {"id", "name", "title", "photoUrl", "phone", "languages"}

    # general enquiry: no property, bogus source falls back to ENQUIRY, junk budget is ignored, blank now = current time
    r = owner.post(f"{BASE}/simulate", json={"propertyId": "", "source": "NOPE", "language": "Hindi", "budget": "abc", "now": None})
    assert r.status_code == 200 and r.json()["result"]["property"] is None

    assert owner.post(f"{BASE}/simulate", json={"now": "not a date"}).json()["error"] == "Invalid date"


def test_simulation_cannot_see_other_tenants_properties(owner, heritage_owner):
    foreign = heritage_owner.get(BASE).json()["properties"]
    if not foreign:
        pytest.skip("heritage has no active property")
    r = owner.post(f"{BASE}/simulate", json={"propertyId": foreign[0]["id"]})
    assert r.status_code == 200 and r.json()["result"]["property"] is None
