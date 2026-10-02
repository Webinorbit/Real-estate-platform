import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text

from app.main import app
from app.models import Broker, Lead, User
from tests.team_helpers import PASSWORD, anonymous, delete_leads, get_lead, login, make_lead, tenant_db, uid

PREFIX = "pytest-team-"
POLYGON = {"type": "Polygon", "coordinates": [[[72.8, 19.0], [72.9, 19.0], [72.9, 19.1], [72.8, 19.0]]]}


def form(**over):
    base = {
        "name": f"pytest {uid()}", "email": f"{PREFIX}{uid()}@example.com", "phone": "", "title": "", "bio": "", "photoUrl": "",
        "role": "BROKER", "languages": ["English", "Klingon"], "specialties": ["Villas"], "areas": ["Juhu"],
        "capacity": 10, "weight": 2, "timezone": "Asia/Kolkata", "workingHours": None, "territory": None, "active": True, "password": "",
    }
    base.update(over)
    return base


def purge(slug: str = "skyline"):
    with tenant_db(slug) as (db, tenant):
        db.execute(delete(Broker).where(Broker.email.like(f"{PREFIX}%")))
        db.execute(delete(User).where(User.tenantId == tenant.id, User.email.like(f"{PREFIX}%")))
        db.commit()


@pytest.fixture(autouse=True)
def cleanup():
    yield
    for slug in ("skyline", "urbannest"):
        purge(slug)


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return login("priya@skyline.demo")


def raw_nulls(broker_id: str) -> tuple[bool, bool]:
    with tenant_db() as (db, _):
        return tuple(db.execute(text('select "workingHours" is null, "territory" is null from "Broker" where id = :i'), {"i": broker_id}).one())


def test_authorization(priya, owner):
    assert anonymous().get("/api/admin/brokers").status_code == 401
    assert anonymous().post("/api/admin/brokers", json=form()).status_code == 401
    for method, url in (("get", "/api/admin/brokers"), ("get", "/api/admin/brokers/new"), ("get", "/api/admin/brokers/x"), ("post", "/api/admin/brokers"),
                        ("put", "/api/admin/brokers/x"), ("post", "/api/admin/brokers/x/active"), ("delete", "/api/admin/brokers/x")):
        res = getattr(priya, method)(url, **({"json": form()} if method in ("post", "put") else {}))
        assert res.status_code == 403, (method, url)
    assert owner.get("/api/admin/brokers", headers={"x-tenant-host": "heritage.localhost"}).status_code == 401


def test_list_and_defaults(owner):
    body = owner.get("/api/admin/brokers").json()
    assert body["count"] == len(body["brokers"]) > 0 and body["maxBrokers"] is None and body["atCap"] is False
    b = body["brokers"][0]
    assert {"id", "name", "capacity", "weight", "languages", "load", "won", "onShift", "self"} <= set(b)
    flags = [x["active"] for x in body["brokers"]]
    assert flags == sorted(flags, reverse=True)
    new = owner.get("/api/admin/brokers/new").json()
    assert new["initial"]["workingHours"]["sat"] == ["10:00", "17:00"] and new["initial"]["workingHours"]["sun"] is None
    assert new["initial"]["languages"] == ["English"] and len(new["mapCenter"]) == 2 and new["atCap"] is False


@pytest.mark.parametrize(
    "over, message",
    [
        ({"name": " a "}, "Name is required"),
        ({"name": "x" * 81}, "Name must be 80 characters or fewer"),
        ({"email": "nope"}, "Enter a valid email"),
        ({"phone": "1" * 31}, "Phone must be 30 characters or fewer"),
        ({"bio": "b" * 601}, "Bio must be 600 characters or fewer"),
        ({"role": "OWNER"}, "Role is not valid"),
        ({"areas": [" "]}, "Areas contains an invalid entry"),
        ({"capacity": 0}, "Capacity must be at least 1"),
        ({"capacity": 501}, "Capacity must be at most 500"),
        ({"capacity": 2.5}, "Capacity must be a whole number"),
        ({"capacity": "abc"}, "Capacity must be a number"),
        ({"weight": 11}, "Weight must be at most 10"),
        ({"workingHours": {"mon": ["09:00", "25:00"]}}, "Working hours must be HH:MM times"),
        ({"workingHours": {"funday": ["09:00", "10:00"]}}, "Invalid working hours"),
        ({"workingHours": {"mon": ["19:00", "09:00"]}}, "Opening time must be before closing time"),
        ({"workingHours": {"mon": ["09:00", "09:00"]}}, "Opening time must be before closing time"),
        ({"territory": {"type": "Polygon", "coordinates": [[[1, 2], [3, 4], [5, 6]]]}}, "Territory must be a polygon with at least three points"),
        ({"territory": {"type": "Point", "coordinates": [1, 2]}}, "Territory must be a polygon with at least three points"),
        ({"territory": {"type": "Polygon", "coordinates": [[[1, 2], [3, 4], [5, "x"], [1, 2]]]}}, "Territory must be a polygon with at least three points"),
        ({"password": "short"}, "Password must be at least 8 characters"),
        ({"active": "yes"}, "Active must be true or false"),
    ],
)
def test_create_validation(owner, over, message):
    res = owner.post("/api/admin/brokers", json=form(**over))
    assert res.status_code == 400 and res.json() == {"error": message}


def test_create_with_password_and_full_roundtrip(owner):
    data = form(password="Passw0rd!x", role="ADMIN", workingHours={"mon": ["09:00", "18:00"], "sun": None}, territory=POLYGON, title="  Agent ")
    created = owner.post("/api/admin/brokers", json=data)
    assert created.status_code == 200, created.text
    out = created.json()
    assert out["ok"] is True and out["tempPassword"] is None

    detail = owner.get(f"/api/admin/brokers/{out['id']}").json()
    initial = detail["initial"]
    assert initial["languages"] == ["English"] and initial["title"] == "Agent" and initial["role"] == "ADMIN"
    assert initial["workingHours"] == {"mon": ["09:00", "18:00"], "sun": None} and initial["territory"] == POLYGON and initial["territoryOn"] is True
    assert detail["isSelf"] is False and detail["lockedRole"] is None and detail["broker"]["email"] == data["email"]
    assert detail["broker"]["userId"]

    listed = next(b for b in owner.get("/api/admin/brokers").json()["brokers"] if b["id"] == out["id"])
    assert listed["load"] == 0 and listed["won"] == 0 and listed["self"] is False and listed["onShift"] in (True, False)

    me = login(data["email"], password="Passw0rd!x")
    assert me.get("/api/auth/me").json()["user"]["role"] == "ADMIN"
    assert me.get("/api/admin/brokers").status_code == 200


def test_create_generates_temp_password_and_rejects_duplicate_email(owner):
    data = form()
    out = owner.post("/api/admin/brokers", json=data).json()
    assert isinstance(out["tempPassword"], str) and len(out["tempPassword"]) >= 8
    me = TestClient(app, headers={"x-tenant-host": "skyline.localhost"})
    assert me.post("/api/auth/login", json={"email": data["email"], "password": out["tempPassword"]}).status_code == 200
    assert me.get("/api/auth/me").json()["user"]["role"] == "BROKER"

    dupe = owner.post("/api/admin/brokers", json=form(email=data["email"].upper()))
    assert dupe.json() == {"error": "A user with this email already exists"}
    assert owner.post("/api/admin/brokers", json=form(email="priya@skyline.demo")).json() == {"error": "A user with this email already exists"}


def test_update_syncs_user_and_nulls_json_columns(owner):
    created = owner.post("/api/admin/brokers", json=form(password="Passw0rd!x", workingHours={"mon": ["09:00", "18:00"]}, territory=POLYGON)).json()
    broker_id = created["id"]
    assert raw_nulls(broker_id) == (False, False)

    new_email = f"{PREFIX}{uid()}@example.com"
    res = owner.put(f"/api/admin/brokers/{broker_id}", json=form(name="pytest renamed", email=new_email, role="ADMIN", password="N3wPassw0rd", workingHours=None, territory=None, capacity=7, active=False))
    assert res.status_code == 200 and res.json() == {"ok": True, "id": broker_id}
    assert raw_nulls(broker_id) == (True, True)

    detail = owner.get(f"/api/admin/brokers/{broker_id}").json()
    assert detail["broker"]["name"] == "pytest renamed" and detail["broker"]["capacity"] == 7 and detail["broker"]["active"] is False
    assert detail["initial"]["workingHours"] is None and detail["initial"]["territory"] is None and detail["initial"]["territoryOn"] is False
    assert detail["initial"]["role"] == "ADMIN"

    client = TestClient(app, headers={"x-tenant-host": "skyline.localhost"})
    assert client.post("/api/auth/login", json={"email": new_email, "password": "Passw0rd!x"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": new_email, "password": "N3wPassw0rd"}).status_code == 200

    other = owner.post("/api/admin/brokers", json=form(password="Passw0rd!x")).json()["id"]
    clash = owner.put(f"/api/admin/brokers/{other}", json=form(email=new_email))
    assert clash.json() == {"error": "Another user already uses this email"}
    short = owner.put(f"/api/admin/brokers/{other}", json=form(password="short"))
    assert short.json() == {"error": "Password must be at least 8 characters"}
    assert owner.put("/api/admin/brokers/missing-id", json=form()).json() == {"error": "Team member not found"}
    assert owner.get("/api/admin/brokers/missing-id").status_code == 404


def test_owner_protections_and_self_removal(owner):
    owner_email = f"{PREFIX}{uid()}@example.com"
    with tenant_db() as (db, tenant):
        temp_owner = User(tenantId=tenant.id, email=owner_email, name="pytest owner", role="OWNER", passwordHash="x")
        db.add(temp_owner)
        db.flush()
        broker = Broker(userId=temp_owner.id, name="pytest owner", email=owner_email)
        db.add(broker)
        db.commit()
        owner_broker_id, owner_user_id = broker.id, temp_owner.id

    detail = owner.get(f"/api/admin/brokers/{owner_broker_id}").json()
    assert detail["lockedRole"] == "Owner" and detail["isSelf"] is False
    assert owner.delete(f"/api/admin/brokers/{owner_broker_id}").json() == {"error": "The account owner cannot be removed"}

    body = form(name="pytest owner renamed", email=owner_email, role="BROKER")
    assert owner.put(f"/api/admin/brokers/{owner_broker_id}", json=body).status_code == 200
    with tenant_db() as (db, _):
        user = db.get(User, owner_user_id)
        assert user.role == "OWNER" and user.name == "pytest owner renamed"

    admin_form = form(role="ADMIN", password="Passw0rd!x")
    admin_id = owner.post("/api/admin/brokers", json=admin_form).json()["id"]
    as_admin = login(admin_form["email"], password="Passw0rd!x")
    assert as_admin.get(f"/api/admin/brokers/{admin_id}").json()["isSelf"] is True
    assert next(b for b in as_admin.get("/api/admin/brokers").json()["brokers"] if b["id"] == admin_id)["self"] is True
    assert as_admin.delete(f"/api/admin/brokers/{admin_id}").json() == {"error": "You cannot remove your own account"}
    assert as_admin.delete(f"/api/admin/brokers/{owner_broker_id}").json() == {"error": "The account owner cannot be removed"}


def test_set_active_and_validation(owner):
    broker_id = owner.post("/api/admin/brokers", json=form()).json()["id"]
    assert owner.post(f"/api/admin/brokers/{broker_id}/active", json={"active": False}).json() == {"ok": True}
    assert owner.get(f"/api/admin/brokers/{broker_id}").json()["broker"]["active"] is False
    assert owner.post(f"/api/admin/brokers/{broker_id}/active", json={"active": True}).json() == {"ok": True}
    assert owner.get(f"/api/admin/brokers/{broker_id}").json()["broker"]["active"] is True
    assert owner.post("/api/admin/brokers/missing-id/active", json={"active": True}).json() == {"error": "Team member not found"}


def test_delete_orphans_leads_and_removes_login(owner):
    data = form(password="Passw0rd!x")
    broker_id = owner.post("/api/admin/brokers", json=data).json()["id"]
    open_lead = make_lead(brokerId=broker_id, status="NEW")
    won_lead = make_lead(brokerId=broker_id, status="WON")
    try:
        listed = next(b for b in owner.get("/api/admin/brokers").json()["brokers"] if b["id"] == broker_id)
        assert listed["load"] == 1 and listed["won"] == 1
        res = owner.delete(f"/api/admin/brokers/{broker_id}")
        assert res.json() == {"ok": True, "orphaned": 1}
        assert get_lead(open_lead).brokerId is None and get_lead(won_lead).brokerId is None
        with tenant_db() as (db, tenant):
            assert db.scalars(select(User).where(User.tenantId == tenant.id, User.email == data["email"])).first() is None
            assert db.scalars(select(Broker).where(Broker.id == broker_id)).first() is None
        client = TestClient(app, headers={"x-tenant-host": "skyline.localhost"})
        assert client.post("/api/auth/login", json={"email": data["email"], "password": "Passw0rd!x"}).status_code == 401
        assert owner.delete(f"/api/admin/brokers/{broker_id}").json() == {"error": "Team member not found"}
    finally:
        delete_leads([open_lead, won_lead])


def test_other_tenant_cannot_manage_skyline_brokers(owner):
    broker_id = owner.post("/api/admin/brokers", json=form()).json()["id"]
    heritage = login("owner@heritage.demo", "heritage")
    assert broker_id not in {b["id"] for b in heritage.get("/api/admin/brokers").json()["brokers"]}
    assert heritage.get(f"/api/admin/brokers/{broker_id}").status_code == 404
    assert heritage.put(f"/api/admin/brokers/{broker_id}", json=form()).json() == {"error": "Team member not found"}
    assert heritage.post(f"/api/admin/brokers/{broker_id}/active", json={"active": False}).json() == {"error": "Team member not found"}
    assert heritage.delete(f"/api/admin/brokers/{broker_id}").json() == {"error": "Team member not found"}
    assert owner.get(f"/api/admin/brokers/{broker_id}").json()["broker"]["active"] is True


def test_starter_plan_seat_cap():
    starter = login("owner@urbannest.demo", "urbannest")
    info = starter.get("/api/admin/brokers").json()
    assert info["maxBrokers"] == 3
    assert starter.get("/api/admin/brokers/new").json()["atCap"] == (info["count"] >= 3)
    for _ in range(max(0, 3 - info["count"])):
        assert starter.post("/api/admin/brokers", json=form()).status_code == 200
    res = starter.post("/api/admin/brokers", json=form())
    assert res.status_code == 400 and res.json() == {"error": "Your plan allows 3 broker seats. Upgrade to add more."}
    assert starter.get("/api/admin/brokers").json()["atCap"] is True
    with tenant_db("urbannest") as (db, _):
        assert db.scalar(select(func.count(Broker.id))) >= 3
