from datetime import timedelta

import pytest
from sqlalchemy import delete, select

from app.dashboard import get_dashboard_data, js_round
from app.models import Broker, Lead, LeadActivity, Property, User, utcnow
from tests.props_helpers import PREFIX, make_client, tag, tenant_db

API = "/api/admin/dashboard"


@pytest.fixture(scope="module")
def owner():
    return make_client(email="owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return make_client(email="priya@skyline.demo")


@pytest.fixture(scope="module")
def super_admin():
    return make_client(email="super@webinorbit.demo")


def priya_broker_id() -> str:
    with tenant_db() as db:
        user = db.scalars(select(User).where(User.email == "priya@skyline.demo")).one()
        return db.scalars(select(Broker.id).where(Broker.userId == user.id)).one()


@pytest.fixture()
def leads():
    """Two fresh leads (NEW with an SLA deadline, one for Priya and one for someone else) plus an activity; removed afterwards."""
    me = priya_broker_id()
    made = []
    with tenant_db() as db:
        other = db.scalars(select(Broker.id).where(Broker.id != me, Broker.active.is_(True))).first()
        for broker_id, suffix in ((me, "mine"), (other, "theirs")):
            lead = Lead(name=f"{PREFIX} {suffix} {tag()}", email="zz@example.com", source="CALLBACK", status="NEW", brokerId=broker_id,
                        slaDueAt=utcnow() - timedelta(days=400), createdAt=utcnow() - timedelta(minutes=5))
            db.add(lead)
            made.append(lead)
        db.commit()
        db.add(LeadActivity(leadId=made[0].id, type="NOTE", note="zz note", actor="tester"))
        db.commit()
        ids = [l.id for l in made]
        names = [l.name for l in made]
    yield {"mine": ids[0], "theirs": ids[1], "mine_name": names[0], "theirs_name": names[1]}
    with tenant_db() as db:
        db.execute(delete(Lead).where(Lead.id.in_(ids)))
        db.commit()


# ---------------------------------------------------------------- access

def test_anonymous_is_401():
    assert make_client().get(API).status_code == 401


def test_other_tenant_session_is_rejected():
    # an owner of skyline calling through urbannest's host is not signed in there
    c = make_client("urbannest.localhost")
    c.cookies.update(make_client(email="owner@skyline.demo").cookies)
    assert c.get(API).status_code == 401


# ---------------------------------------------------------------- shape

def check_shape(data: dict) -> None:
    assert set(data) >= {"kpis", "series", "statusCounts", "sourceCounts", "leaderboard", "atRisk", "recent", "topProperties"}
    k = data["kpis"]
    assert set(k) == {"leads", "response", "winRate", "listings"}
    assert set(k["leads"]) == {"value", "delta", "spark"} and len(k["leads"]["spark"]) == 30
    assert k["response"]["delta"] is None and len(k["response"]["spark"]) == 30
    assert len(k["winRate"]["spark"]) == 30 and set(k["listings"]) == {"value", "views"}
    assert len(data["series"]) == 30
    dates = [s["date"] for s in data["series"]]
    assert dates == sorted(set(dates)) and dates[-1] == utcnow().date().isoformat()
    assert all(set(s) == {"date", "leads", "won", "response"} for s in data["series"])
    assert [s["status"] for s in data["statusCounts"]] == ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST"]
    assert all(c["count"] > 0 for c in data["sourceCounts"])
    assert len(data["atRisk"]) <= 6 and len(data["recent"]) <= 8 and len(data["topProperties"]) <= 5


def test_owner_dashboard_matches_the_database(owner):
    data = owner.get(API).json()
    check_shape(data)
    assert data["isStaff"] is True and data["firstName"] and data["tenantName"]
    assert data["tenantName"] == owner.get("/api/auth/context").json()["tenant"]["name"]

    now = utcnow()
    with tenant_db() as db:
        recent = db.scalars(select(Lead).where(Lead.createdAt >= now - timedelta(days=30))).all()
        active = db.execute(select(Property.views).where(Property.status == "ACTIVE")).all()
        active_brokers = db.scalars(select(Broker.id).where(Broker.active.is_(True))).all()
    assert abs(data["kpis"]["leads"]["value"] - len(recent)) <= 2
    assert data["kpis"]["listings"] == {"value": len(active), "views": sum(v for (v,) in active)}
    assert sum(c["count"] for c in data["statusCounts"]) == data["kpis"]["leads"]["value"]
    assert sum(c["count"] for c in data["sourceCounts"]) == data["kpis"]["leads"]["value"]
    assert sum(data["kpis"]["leads"]["spark"]) <= data["kpis"]["leads"]["value"]
    assert {b["id"] for b in data["leaderboard"]} == set(active_brokers)
    board = [(b["won"], b["leads"]) for b in data["leaderboard"]]
    assert board == sorted(board, reverse=True)
    assert set(data["leaderboard"][0]) == {"id", "name", "photoUrl", "title", "capacity", "leads", "won", "open", "avgResponse"}
    views = [p["views"] for p in data["topProperties"]]
    assert views == sorted(views, reverse=True)
    deadlines = [a["slaDueAt"] for a in data["atRisk"]]
    assert deadlines == sorted(deadlines) and all(d.endswith("Z") for d in deadlines)
    ats = [r["at"] for r in data["recent"]]
    assert ats == sorted(ats, reverse=True)


def test_broker_sees_only_their_own_leads(priya, owner, leads):
    mine = priya_broker_id()
    data = priya.get(API).json()
    check_shape(data)
    assert data["isStaff"] is False and data["leaderboard"] == []
    assert data["firstName"] == "Priya"

    with tenant_db() as db:
        expected = db.scalars(select(Lead).where(Lead.brokerId == mine, Lead.createdAt >= utcnow() - timedelta(days=30))).all()
    assert abs(data["kpis"]["leads"]["value"] - len(expected)) <= 1

    risk_ids = {a["id"] for a in data["atRisk"]}
    assert leads["theirs"] not in risk_ids
    with tenant_db() as db:
        own_risk = db.scalars(select(Lead.id).where(Lead.brokerId == mine, Lead.status == "NEW", Lead.slaDueAt.is_not(None))).all()
    assert risk_ids <= set(own_risk)
    assert all(r["leadId"] != leads["theirs"] for r in data["recent"])
    with tenant_db() as db:
        own_leads = set(db.scalars(select(Lead.id).where(Lead.brokerId == mine)).all())
    assert {r["leadId"] for r in data["recent"]} <= own_leads

    staff = owner.get(API).json()
    assert staff["kpis"]["leads"]["value"] >= data["kpis"]["leads"]["value"]


def test_at_risk_and_recent_entries(owner, priya, leads):
    # the fixture deadlines are ~400 days old, so they sort first among NEW leads with a deadline
    data = owner.get(API).json()
    ids = [a["id"] for a in data["atRisk"]]
    assert leads["mine"] in ids and leads["theirs"] in ids
    entry = next(a for a in data["atRisk"] if a["id"] == leads["mine"])
    assert set(entry) == {"id", "name", "property", "broker", "slaDueAt", "escalated"}
    assert entry["name"] == leads["mine_name"] and entry["property"] is None and entry["broker"] and entry["escalated"] is False

    mine_view = priya.get(API).json()
    assert leads["mine"] in [a["id"] for a in mine_view["atRisk"]] and leads["theirs"] not in [a["id"] for a in mine_view["atRisk"]]

    note = next(r for r in data["recent"] if r["leadId"] == leads["mine"])
    assert note["type"] == "NOTE" and note["note"] == "zz note" and note["actor"] == "tester" and note["leadName"] == leads["mine_name"]
    assert note["at"].endswith("Z") and set(note) == {"id", "type", "note", "actor", "at", "leadId", "leadName"}


def test_super_admin_counts_as_staff(super_admin):
    data = super_admin.get(API).json()
    check_shape(data)
    assert data["isStaff"] is True and data["leaderboard"]


def test_fresh_lead_shows_up_in_todays_series(owner, leads):
    data = owner.get(API).json()
    today = data["series"][-1]
    assert today["date"] == utcnow().date().isoformat() and today["leads"] >= 2
    assert any(c["source"] == "CALLBACK" and c["count"] >= 2 for c in data["sourceCounts"])


# ---------------------------------------------------------------- the maths (deterministic, direct)

def test_metrics_with_controlled_data():
    """Runs the calculation on fixture leads we create: response times, win rates, deltas, ordering, JS rounding."""
    now = utcnow()
    t = tag()
    with tenant_db() as db:
        brokers = db.scalars(select(Broker).where(Broker.active.is_(True)).order_by(Broker.createdAt).limit(2)).all()
        b1, b2 = brokers
        base = get_dashboard_data(db, True, None, now=now)
        made = []

        def lead(age_days, status, broker, responded_after=None, source="ENQUIRY"):
            created = now - timedelta(days=age_days)
            l = Lead(name=f"{PREFIX} m {t}", email="m@example.com", source=source, status=status, brokerId=broker.id, createdAt=created,
                     firstResponseAt=created + timedelta(minutes=responded_after) if responded_after is not None else None)
            made.append(l)
            return l

        db.add_all([
            lead(1, "WON", b1, 10), lead(1, "WON", b1, 15), lead(2, "LOST", b1, None, "CONTACT"),
            lead(3, "NEW", b2, 6), lead(40, "WON", b2, 30), lead(45, "NEW", b2),
        ])
        db.commit()
        try:
            data = get_dashboard_data(db, True, None, now=now)
        finally:
            db.execute(delete(Lead).where(Lead.id.in_([l.id for l in made])))
            db.commit()

    # four fresh leads in the current window, two in the previous window
    assert data["kpis"]["leads"]["value"] == base["kpis"]["leads"]["value"] + 4
    day = {s["date"]: s for s in data["series"]}
    d1 = (now - timedelta(days=1)).date().isoformat()
    b_day = {s["date"]: s for s in base["series"]}
    assert day[d1]["leads"] - b_day[d1]["leads"] == 2 and day[d1]["won"] - b_day[d1]["won"] == 2

    def board(d, bid):
        return next(b for b in d["leaderboard"] if b["id"] == bid)

    assert board(data, b1.id)["leads"] - board(base, b1.id)["leads"] == 3
    assert board(data, b1.id)["won"] - board(base, b1.id)["won"] == 2
    assert board(data, b2.id)["leads"] - board(base, b2.id)["leads"] == 1  # the 40/45 day old ones are outside the window
    assert board(data, b2.id)["won"] == board(base, b2.id)["won"]
    assert board(data, b1.id)["open"] == board(base, b1.id)["open"]
    assert board(data, b2.id)["open"] - board(base, b2.id)["open"] == 2  # open load counts every NEW lead regardless of age

    # JS Math.round rounds halves up; python's round() would give 12 for 12.5
    assert js_round(12.5) == 13 and js_round(0.5) == 1 and js_round(-0.5) == 0 and js_round(2.4) == 2


def test_broker_scope_without_a_broker_profile_sees_nothing():
    with tenant_db() as db:
        data = get_dashboard_data(db, False, None)
    assert data["kpis"]["leads"]["value"] == 0 and data["atRisk"] == [] and data["recent"] == [] and data["leaderboard"] == []
    assert data["kpis"]["winRate"]["value"] == 0 and data["kpis"]["response"]["value"] is None
    assert data["kpis"]["listings"]["value"] >= 0 and all(c["count"] == 0 for c in data["statusCounts"]) and data["sourceCounts"] == []
