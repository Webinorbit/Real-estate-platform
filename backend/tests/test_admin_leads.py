import pytest

from tests.team_helpers import anonymous, broker_of, delete_leads, get_lead, login, make_lead, minutes_ago, tenant_db, uid


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return login("priya@skyline.demo")


@pytest.fixture(scope="module")
def heritage_owner():
    return login("owner@heritage.demo", "heritage")


@pytest.fixture()
def leads():
    """Two leads sharing a unique search token: `mine` for priya, `theirs` unassigned."""
    token = f"pytest-{uid()}"
    mine = broker_of("priya@skyline.demo")
    ids = {
        "token": token,
        "mine": make_lead(name=f"{token} mine", brokerId=mine.id, status="NEW", slaDueAt=minutes_ago(-10), phone="+91 99999 12345"),
        "theirs": make_lead(name=f"{token} theirs", brokerId=None, status="CONTACTED", email="theirs@example.com"),
        "broker": mine.id,
    }
    yield ids
    delete_leads([ids["mine"], ids["theirs"]])


def names(res):
    return sorted(l["name"].split(" ")[-1] for l in res.json()["leads"])


def test_all_lead_endpoints_need_a_session(leads):
    anon = anonymous()
    assert anon.get("/api/admin/leads").status_code == 401
    assert anon.get(f"/api/admin/leads/{leads['mine']}").status_code == 401
    assert anon.get("/api/admin/pipeline").status_code == 401
    assert anon.post(f"/api/admin/leads/{leads['mine']}/status", json={"status": "WON"}).status_code == 401
    assert anon.post(f"/api/admin/leads/{leads['mine']}/notes", json={"note": "x"}).status_code == 401
    assert anon.post(f"/api/admin/leads/{leads['mine']}/assign", json={"brokerId": leads["broker"]}).status_code == 401


def test_staff_list_filters_search_and_counts(owner, leads):
    t = leads["token"]
    res = owner.get("/api/admin/leads", params={"q": t})
    body = res.json()
    assert res.status_code == 200 and body["total"] == 2 and names(res) == ["mine", "theirs"]
    assert body["isStaff"] is True and body["brokers"] and body["pageSize"] == 25
    row = next(l for l in body["leads"] if l["name"].endswith("mine"))
    assert row["broker"]["name"] and row["property"] is None and row["slaDueAt"].endswith("Z")
    assert set(body["counts"]) == {"NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST"}
    assert body["allCount"] == sum(body["counts"].values())

    assert names(owner.get("/api/admin/leads", params={"q": t, "status": "NEW"})) == ["mine"]
    assert names(owner.get("/api/admin/leads", params={"q": t, "status": "open"})) == ["mine", "theirs"]
    assert names(owner.get("/api/admin/leads", params={"q": t, "status": "WON"})) == []
    assert names(owner.get("/api/admin/leads", params={"q": t, "broker": "unassigned"})) == ["theirs"]
    assert names(owner.get("/api/admin/leads", params={"q": t, "broker": leads["broker"]})) == ["mine"]
    assert names(owner.get("/api/admin/leads", params={"q": "theirs@example.com"})) == ["theirs"]
    assert names(owner.get("/api/admin/leads", params={"q": "99999 12345"})) == ["mine"]
    assert names(owner.get("/api/admin/leads", params={"q": t.upper()})) == ["mine", "theirs"]
    assert owner.get("/api/admin/leads", params={"q": "%"}).json()["total"] == 0
    assert owner.get("/api/admin/leads", params={"q": t, "status": "bogus"}).json()["filters"]["status"] is None


def test_pagination(owner, leads):
    first = owner.get("/api/admin/leads").json()
    assert first["page"] == 1 and first["pages"] == -(-first["total"] // 25) and len(first["leads"]) <= 25
    stamps = [l["createdAt"] for l in first["leads"]]
    assert stamps == sorted(stamps, reverse=True)
    assert owner.get("/api/admin/leads", params={"page": "0"}).json()["page"] == 1
    assert owner.get("/api/admin/leads", params={"page": "abc"}).json()["page"] == 1
    if first["pages"] > 1:
        second = owner.get("/api/admin/leads", params={"page": 2}).json()
        assert second["page"] == 2 and not {l["id"] for l in first["leads"]} & {l["id"] for l in second["leads"]}


def test_broker_only_sees_own_leads(priya, leads):
    res = priya.get("/api/admin/leads", params={"q": leads["token"]})
    assert names(res) == ["mine"]
    assert res.json()["isStaff"] is False and res.json()["brokers"] == []
    sneaky = priya.get("/api/admin/leads", params={"q": leads["token"], "broker": "unassigned"})
    assert names(sneaky) == ["mine"]
    assert all(l["brokerId"] == leads["broker"] for l in priya.get("/api/admin/leads").json()["leads"])
    assert priya.get("/api/admin/leads").json()["allCount"] <= login("owner@skyline.demo").get("/api/admin/leads").json()["allCount"]


def test_lead_detail(owner, priya, leads):
    d = owner.get(f"/api/admin/leads/{leads['mine']}")
    assert d.status_code == 200
    body = d.json()
    assert body["lead"]["broker"]["id"] == leads["broker"] and body["lead"]["property"] is None
    assert body["lead"]["activities"] == [] and body["lead"]["assignments"] == [] and body["audit"] is None
    assert body["brokers"] and all(set(b) == {"id", "name"} for b in body["brokers"])

    assert priya.get(f"/api/admin/leads/{leads['mine']}").status_code == 200
    assert priya.get(f"/api/admin/leads/{leads['mine']}").json()["brokers"] == []
    assert priya.get(f"/api/admin/leads/{leads['theirs']}").status_code == 404
    assert owner.get("/api/admin/leads/does-not-exist-123").status_code == 404


def test_detail_orders_activities_and_assignments_newest_first(owner, leads):
    lead_id = leads["theirs"]
    assert owner.post(f"/api/admin/leads/{lead_id}/notes", json={"note": "first"}).status_code == 200
    assert owner.post(f"/api/admin/leads/{lead_id}/assign", json={"brokerId": leads["broker"]}).status_code == 200
    body = owner.get(f"/api/admin/leads/{lead_id}").json()
    acts = body["lead"]["activities"]
    assert [a["createdAt"] for a in acts] == sorted((a["createdAt"] for a in acts), reverse=True)
    assert {a["type"] for a in acts} >= {"NOTE", "MANUAL"}
    assign = body["lead"]["assignments"][0]
    assert assign["kind"] == "MANUAL" and assign["broker"]["name"] and assign["reasons"]
    assert body["audit"] == {"candidates": [], "trace": []}
    assert body["lead"]["brokerId"] == leads["broker"]


def test_status_updates_and_ownership(owner, priya, leads):
    url = lambda k: f"/api/admin/leads/{leads[k]}/status"  # noqa: E731
    assert priya.post(url("mine"), json={"status": "NOPE"}).json() == {"error": "Unknown status"}
    res = priya.post(url("theirs"), json={"status": "CONTACTED"})
    assert res.status_code == 400 and res.json() == {"error": "This lead is assigned to another broker"}

    assert priya.post(url("mine"), json={"status": "CONTACTED"}).json() == {"ok": True}
    lead = get_lead(leads["mine"])
    assert lead.status == "CONTACTED" and lead.firstResponseAt is not None and lead.slaDueAt is None

    assert priya.post(url("mine"), json={"status": "LOST", "lostReason": "Budget mismatch"}).status_code == 200
    assert get_lead(leads["mine"]).lostReason == "Budget mismatch"
    notes = owner.get(f"/api/admin/leads/{leads['mine']}").json()["lead"]["activities"]
    status_notes = [a["note"] for a in notes if a["type"] == "STATUS"]
    assert status_notes == ["CONTACTED → LOST", "NEW → CONTACTED"]
    assert all(a["actor"] for a in notes)

    assert owner.post(url("theirs"), json={"status": "VIEWING"}).status_code == 200
    assert get_lead(leads["theirs"]).status == "VIEWING"
    assert owner.post("/api/admin/leads/missing-lead-id/status", json={"status": "WON"}).json() == {"error": "Lead not found"}


def test_notes(owner, priya, leads):
    url = lambda k: f"/api/admin/leads/{leads[k]}/notes"  # noqa: E731
    assert priya.post(url("mine"), json={"note": "   "}).json() == {"error": "Write a note first"}
    assert priya.post(url("mine"), json={}).status_code == 400
    assert priya.post(url("theirs"), json={"note": "hi"}).json() == {"error": "This lead is assigned to another broker"}
    res = priya.post(url("mine"), json={"note": "  Called back  "})
    assert res.status_code == 200 and res.json()["activity"]["note"] == "Called back" and res.json()["activity"]["type"] == "NOTE"
    long = owner.post(url("mine"), json={"note": "x" * 3000}).json()
    assert len(long["activity"]["note"]) == 2000


def test_only_staff_can_assign(owner, priya, leads):
    url = f"/api/admin/leads/{leads['theirs']}/assign"
    assert priya.post(url, json={"brokerId": leads["broker"]}).status_code == 403
    assert owner.post(url, json={"brokerId": "nope"}).json() == {"error": "Lead or broker not found"}
    assert owner.post(url, json={}).json() == {"error": "Lead or broker not found"}
    assert owner.post("/api/admin/leads/missing-lead/assign", json={"brokerId": leads["broker"]}).json() == {"error": "Lead or broker not found"}
    assert owner.post(url, json={"brokerId": leads["broker"]}).json() == {"ok": True}
    assert get_lead(leads["theirs"]).brokerId == leads["broker"]


def test_pipeline_scoping(owner, priya, leads):
    ids = lambda c: {l["id"] for l in c.get("/api/admin/pipeline").json()["leads"]}  # noqa: E731
    assert {leads["mine"], leads["theirs"]} <= ids(owner)
    own = ids(priya)
    assert leads["mine"] in own and leads["theirs"] not in own
    card = next(l for l in owner.get("/api/admin/pipeline").json()["leads"] if l["id"] == leads["mine"])
    assert set(card) == {"id", "name", "status", "property", "brokerName", "brokerPhoto", "createdAt", "slaDueAt", "firstResponseAt"}
    assert card["brokerName"] and card["status"] == "NEW"


def test_other_tenant_cannot_touch_these_leads(heritage_owner, owner, leads):
    assert leads["mine"] not in {l["id"] for l in heritage_owner.get("/api/admin/pipeline").json()["leads"]}
    assert heritage_owner.get(f"/api/admin/leads/{leads['mine']}").status_code == 404
    assert heritage_owner.post(f"/api/admin/leads/{leads['mine']}/status", json={"status": "WON"}).json() == {"error": "Lead not found"}
    assert heritage_owner.post(f"/api/admin/leads/{leads['mine']}/assign", json={"brokerId": leads["broker"]}).json() == {"error": "Lead or broker not found"}
    assert heritage_owner.get("/api/admin/leads", params={"q": leads["token"]}).json()["total"] == 0
    assert owner.get("/api/admin/leads", headers={"x-tenant-host": "heritage.localhost"}).status_code == 401
    assert get_lead(leads["mine"]).status == "NEW"
