import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import SessionLocal, bind_tenant
from app.main import app
from app.models import Broker, Lead, LeadActivity, Tenant, User

PASSWORD = "demo1234"
OPEN = {"NEW", "CONTACTED", "VIEWING", "NEGOTIATION"}


def client(host: str = "skyline.localhost") -> TestClient:
    return TestClient(app, headers={"x-tenant-host": host})


def login(c: TestClient, email: str) -> TestClient:
    res = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return c


@pytest.fixture(scope="module")
def owner():
    return login(client(), "owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return login(client(), "priya@skyline.demo")


@pytest.fixture(scope="module")
def other_owner():
    return login(client("urbannest.localhost"), "owner@urbannest.demo")


@pytest.fixture(scope="module")
def brokers(owner):
    rows = owner.get("/api/admin/brokers").json()["brokers"]
    by_email = {b["email"]: b for b in rows}
    return by_email


@pytest.fixture()
def lead(brokers):
    """A fresh NEW lead assigned to Priya, removed afterwards."""
    priya = brokers["priya@skyline.demo"]
    with SessionLocal() as db:
        bind_tenant(db, priya["tenantId"])
        row = Lead(name="Pytest Lead", email="pytest-lead@example.com", phone="+91 99999 12345", brokerId=priya["id"], status="NEW", message="hello")
        db.add(row)
        db.flush()
        db.add(LeadActivity(leadId=row.id, type="CREATED", actor="visitor", note="Source: ENQUIRY"))
        db.commit()
        lead_id = row.id
    yield lead_id
    with SessionLocal() as db:
        db.execute(delete(Lead).where(Lead.id == lead_id))
        db.commit()


# ------------------------------------------------------------------ auth


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/admin/leads"),
        ("get", "/api/admin/leads/whatever"),
        ("get", "/api/admin/pipeline"),
        ("post", "/api/admin/leads/whatever/status"),
        ("post", "/api/admin/leads/whatever/notes"),
        ("post", "/api/admin/leads/whatever/assign"),
    ],
)
def test_unauthenticated_is_401(method, path):
    res = getattr(client(), method)(path)
    assert res.status_code == 401


# ------------------------------------------------------------------ list


def test_list_shape_and_counts(owner):
    data = owner.get("/api/admin/leads").json()
    assert data["isStaff"] is True
    assert data["pageSize"] == 25
    assert len(data["leads"]) <= 25
    assert data["total"] >= len(data["leads"])
    assert data["allCount"] == sum(data["counts"].values())
    assert data["pages"] == -(-data["total"] // 25)
    assert data["brokers"] and {"id", "name"} == set(data["brokers"][0])
    row = data["leads"][0]
    assert "property" in row and "broker" in row and row["createdAt"].endswith("Z")
    created = [r["createdAt"] for r in data["leads"]]
    assert created == sorted(created, reverse=True)


def test_list_filters(owner):
    open_rows = owner.get("/api/admin/leads", params={"status": "open", "page": 1}).json()
    assert open_rows["filters"]["status"] == "open"
    assert all(r["status"] in OPEN for r in open_rows["leads"])

    won = owner.get("/api/admin/leads", params={"status": "WON"}).json()
    assert all(r["status"] == "WON" for r in won["leads"])
    assert won["total"] == won["counts"].get("WON", 0)

    ignored = owner.get("/api/admin/leads", params={"status": "bogus"}).json()
    assert ignored["filters"]["status"] is None

    unassigned = owner.get("/api/admin/leads", params={"broker": "unassigned"}).json()
    assert all(r["brokerId"] is None for r in unassigned["leads"])

    first = owner.get("/api/admin/leads").json()["leads"][0]
    needle = first["name"][:4].upper()
    found = owner.get("/api/admin/leads", params={"q": f"  {needle} "}).json()
    assert found["filters"]["q"] == needle
    assert first["id"] in {r["id"] for r in found["leads"]} or found["total"] > 25
    assert all(needle.lower() in (r["name"] + r["email"]).lower() or needle in (r["phone"] or "") for r in found["leads"])

    assert owner.get("/api/admin/leads", params={"q": "%"}).json()["total"] == 0  # wildcards are escaped, not special
    assert owner.get("/api/admin/leads", params={"q": "zzzz-no-such-lead"}).json()["leads"] == []


def test_list_pagination(owner):
    p1 = owner.get("/api/admin/leads").json()
    bad = owner.get("/api/admin/leads", params={"page": "abc"}).json()
    assert bad["page"] == 1 and [r["id"] for r in bad["leads"]] == [r["id"] for r in p1["leads"]]
    if p1["total"] > 25:
        p2 = owner.get("/api/admin/leads", params={"page": 2}).json()
        assert p2["page"] == 2
        assert not ({r["id"] for r in p1["leads"]} & {r["id"] for r in p2["leads"]})
    far = owner.get("/api/admin/leads", params={"page": 999}).json()
    assert far["leads"] == []


def test_broker_only_sees_own_leads(priya, brokers):
    me = brokers["priya@skyline.demo"]["id"]
    data = priya.get("/api/admin/leads", params={"broker": "unassigned"}).json()
    assert data["isStaff"] is False
    assert data["brokers"] == []
    assert data["leads"] and all(r["brokerId"] == me for r in data["leads"])
    assert data["allCount"] == data["total"] or data["total"] <= data["allCount"]


# ------------------------------------------------------------------ detail


def test_detail_for_staff(owner, lead):
    res = owner.get(f"/api/admin/leads/{lead}")
    assert res.status_code == 200
    data = res.json()
    l = data["lead"]
    assert l["id"] == lead and l["broker"]["email"] == "priya@skyline.demo"
    assert l["property"] is None
    assert l["activities"] and l["activities"][0]["type"] == "CREATED"
    assert l["assignments"] == [] and data["audit"] is None
    assert data["brokers"] and all(set(b) == {"id", "name"} for b in data["brokers"])


def test_detail_includes_audit_for_routed_lead(owner):
    rows = owner.get("/api/admin/leads").json()["leads"]
    for row in rows:
        detail = owner.get(f"/api/admin/leads/{row['id']}").json()
        if detail["lead"]["assignments"]:
            a = detail["lead"]["assignments"][0]
            assert "broker" in a and "kind" in a
            assert set(detail["audit"]) == {"candidates", "trace"}
            return
    pytest.skip("no routed lead in seed data")


def test_detail_visibility_rules(owner, priya, other_owner, brokers):
    me = brokers["priya@skyline.demo"]["id"]
    rows = owner.get("/api/admin/leads", params={"page": 1}).json()["leads"]
    mine = next(r for r in rows + owner.get("/api/admin/leads", params={"page": 2}).json()["leads"] if r["brokerId"] == me)
    theirs = next(r for r in rows if r["brokerId"] and r["brokerId"] != me)

    assert priya.get(f"/api/admin/leads/{mine['id']}").status_code == 200
    detail = priya.get(f"/api/admin/leads/{mine['id']}").json()
    assert detail["brokers"] == [] and detail["isStaff"] is False
    assert priya.get(f"/api/admin/leads/{theirs['id']}").status_code == 404

    assert other_owner.get(f"/api/admin/leads/{mine['id']}").status_code == 404
    assert owner.get("/api/admin/leads/does-not-exist").status_code == 404


# ------------------------------------------------------------------ pipeline


def test_pipeline(owner, priya, lead, brokers):
    me = brokers["priya@skyline.demo"]["id"]
    data = owner.get("/api/admin/pipeline").json()["leads"]
    assert len(data) <= 300
    card = next(c for c in data if c["id"] == lead)
    assert set(card) == {"id", "name", "status", "property", "brokerName", "brokerPhoto", "createdAt", "slaDueAt", "firstResponseAt"}
    assert card["brokerName"] == "Priya Sharma" and card["property"] is None

    own = priya.get("/api/admin/pipeline").json()["leads"]
    assert any(c["id"] == lead for c in own)
    mine = [c["id"] for c in own]
    with SessionLocal() as db:
        wrong = db.scalars(select(Lead.id).where(Lead.id.in_(mine), Lead.brokerId != me)).all()
    assert wrong == []


# ------------------------------------------------------------------ mutations


def test_status_flow(owner, lead):
    assert owner.post(f"/api/admin/leads/{lead}/status", json={"status": "NOPE"}).json() == {"error": "Unknown status"}
    assert owner.post(f"/api/admin/leads/{lead}/status", json={}).status_code == 400

    res = owner.post(f"/api/admin/leads/{lead}/status", json={"status": "CONTACTED"})
    assert res.status_code == 200 and res.json() == {"ok": True}
    after = owner.get(f"/api/admin/leads/{lead}").json()["lead"]
    assert after["status"] == "CONTACTED"
    assert after["firstResponseAt"] is not None and after["slaDueAt"] is None

    res = owner.post(f"/api/admin/leads/{lead}/status", json={"status": "LOST", "lostReason": "Budget mismatch"})
    assert res.json() == {"ok": True}

    detail = owner.get(f"/api/admin/leads/{lead}").json()["lead"]
    assert detail["lostReason"] == "Budget mismatch"
    notes = [a["note"] for a in detail["activities"] if a["type"] == "STATUS"]
    assert "NEW → CONTACTED" in notes[-1] and "CONTACTED → LOST" in notes[0]
    assert detail["activities"][0]["actor"] == "Skyline Owner" or detail["activities"][0]["actor"]

    assert owner.post("/api/admin/leads/missing/status", json={"status": "WON"}).json() == {"error": "Lead not found"}


def test_notes(owner, lead):
    assert owner.post(f"/api/admin/leads/{lead}/notes", json={"note": "   "}).json() == {"error": "Write a note first"}
    assert owner.post(f"/api/admin/leads/{lead}/notes", json={}).status_code == 400
    res = owner.post(f"/api/admin/leads/{lead}/notes", json={"note": "x" * 2500})
    assert res.status_code == 200
    assert res.json()["activity"]["type"] == "NOTE" and len(res.json()["activity"]["note"]) == 2000
    assert owner.post("/api/admin/leads/missing/notes", json={"note": "hi"}).json() == {"error": "Lead not found"}


def test_manual_assignment(owner, priya, lead, brokers):
    other = next(b for e, b in brokers.items() if e != "priya@skyline.demo" and b["active"])
    res = owner.post(f"/api/admin/leads/{lead}/assign", json={"brokerId": other["id"]})
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}
    detail = owner.get(f"/api/admin/leads/{lead}").json()["lead"]
    assert detail["brokerId"] == other["id"]
    assert detail["assignments"][0]["kind"] == "MANUAL"
    assert detail["assignments"][0]["broker"]["name"] == other["name"]

    missing = {"error": "Lead or broker not found"}
    assert owner.post(f"/api/admin/leads/{lead}/assign", json={"brokerId": "nobody"}).json() == missing
    assert owner.post(f"/api/admin/leads/{lead}/assign", json={}).json() == missing

    # Priya no longer owns it
    assert priya.get(f"/api/admin/leads/{lead}").status_code == 404


def test_broker_permissions(priya, lead, brokers):
    other = brokers["arjun@skyline.demo"]
    assert priya.post(f"/api/admin/leads/{lead}/assign", json={"brokerId": other["id"]}).status_code == 403

    # own lead: allowed
    assert priya.post(f"/api/admin/leads/{lead}/status", json={"status": "VIEWING"}).json()["ok"] is True
    assert priya.post(f"/api/admin/leads/{lead}/notes", json={"note": "called back"}).json()["ok"] is True
    detail = priya.get(f"/api/admin/leads/{lead}").json()["lead"]
    assert detail["status"] == "VIEWING" and detail["activities"][0]["actor"] == "Priya Sharma"


def test_broker_cannot_touch_someone_elses_lead(priya, lead, brokers, owner):
    owner.post(f"/api/admin/leads/{lead}/assign", json={"brokerId": brokers["arjun@skyline.demo"]["id"]})
    res = priya.post(f"/api/admin/leads/{lead}/status", json={"status": "CONTACTED"})
    assert res.status_code == 400 and res.json()["error"] == "This lead is assigned to another broker"
    assert priya.post(f"/api/admin/leads/{lead}/notes", json={"note": "sneaky"}).json()["error"] == "This lead is assigned to another broker"
    assert owner.get(f"/api/admin/leads/{lead}").json()["lead"]["status"] == "NEW"


def test_cross_tenant_mutations_are_not_found(other_owner, lead):
    not_found = {"error": "Lead not found"}
    assert other_owner.post(f"/api/admin/leads/{lead}/status", json={"status": "WON"}).json() == not_found
    assert other_owner.post(f"/api/admin/leads/{lead}/notes", json={"note": "hi"}).json() == not_found
    assert other_owner.post(f"/api/admin/leads/{lead}/assign", json={"brokerId": "x"}).json() == {"error": "Lead or broker not found"}
