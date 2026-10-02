import pytest

from app.dashboard import _delta, js_round
from tests.team_helpers import anonymous, broker_of, delete_leads, login, make_lead, minutes_ago, uid


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return login("priya@skyline.demo")


def test_js_rounding_matches_math_round():
    assert [js_round(x) for x in (0.5, 1.5, 2.5, -0.5, -2.5, 2.4)] == [1, 2, 3, 0, -2, 2]
    assert _delta(5, 0) == 100 and _delta(0, 0) == 0 and _delta(15, 10) == 50 and _delta(5, 10) == -50


def test_dashboard_requires_a_session():
    assert anonymous().get("/api/admin/dashboard").status_code == 401


def test_dashboard_is_tenant_bound(owner):
    other = owner.get("/api/admin/dashboard", headers={"x-tenant-host": "heritage.localhost"})
    assert other.status_code == 401


def test_staff_dashboard_shape(owner):
    res = owner.get("/api/admin/dashboard")
    assert res.status_code == 200
    d = res.json()
    assert d["isStaff"] is True and d["tenantName"] and d["firstName"]
    assert set(d["kpis"]) == {"leads", "response", "winRate", "listings"}
    assert len(d["series"]) == 30 and len(d["kpis"]["leads"]["spark"]) == 30
    assert d["series"][0]["date"] < d["series"][-1]["date"]
    assert [s["status"] for s in d["statusCounts"]] == ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST"]
    assert all(s["count"] > 0 for s in d["sourceCounts"])
    assert d["kpis"]["leads"]["value"] == sum(s["count"] for s in d["statusCounts"])
    assert sum(s["leads"] for s in d["series"]) <= d["kpis"]["leads"]["value"]
    assert d["leaderboard"] and {"id", "name", "capacity", "leads", "won", "open", "avgResponse"} <= set(d["leaderboard"][0])
    wins = [b["won"] for b in d["leaderboard"]]
    assert wins == sorted(wins, reverse=True)
    assert len(d["topProperties"]) <= 5 and len(d["recent"]) <= 8 and len(d["atRisk"]) <= 6
    views = [p["views"] for p in d["topProperties"]]
    assert views == sorted(views, reverse=True)


def test_broker_dashboard_is_scoped_to_own_leads(owner, priya):
    mine = broker_of("priya@skyline.demo")
    ids = [
        make_lead(brokerId=mine.id, status="NEW", slaDueAt=minutes_ago(-5), source="CALLBACK"),
        make_lead(brokerId=None, status="NEW", slaDueAt=minutes_ago(-1), name=f"pytest-{uid()}"),
    ]
    try:
        staff = owner.get("/api/admin/dashboard").json()
        own = priya.get("/api/admin/dashboard").json()
        assert own["isStaff"] is False and own["leaderboard"] == []
        assert own["kpis"]["leads"]["value"] <= staff["kpis"]["leads"]["value"]
        at_risk_ids = {a["id"] for a in own["atRisk"]}
        assert ids[0] in at_risk_ids and ids[1] not in at_risk_ids
        assert ids[1] in {a["id"] for a in staff["atRisk"]} or len(staff["atRisk"]) == 6
        assert all(a["leadId"] for a in own["recent"])
        assert any(s["source"] == "CALLBACK" for s in own["sourceCounts"])
    finally:
        delete_leads(ids)
