import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import SessionLocal
from app.main import app
from app.models import Broker, Lead, User

PASSWORD = "demo1234"
SQUARE = {"type": "Polygon", "coordinates": [[[72.8, 19.0], [72.9, 19.0], [72.9, 19.1], [72.8, 19.1], [72.8, 19.0]]]}


def client(host: str = "skyline.localhost") -> TestClient:
    return TestClient(app, headers={"x-tenant-host": host})


def login(c: TestClient, email: str, password: str = PASSWORD):
    res = c.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return c


@pytest.fixture(scope="module")
def owner():
    return login(client(), "owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return login(client(), "priya@skyline.demo")


@pytest.fixture(scope="module")
def small_owner():
    return login(client("urbannest.localhost"), "owner@urbannest.demo")


def payload(**over):
    base = {
        "name": "Pytest Broker", "email": "pytest.broker@skyline.demo", "phone": "+91 90000 00000", "title": "Associate", "bio": "",
        "photoUrl": "", "role": "BROKER", "languages": ["English", "Klingon"], "specialties": ["Villas"], "areas": ["Juhu"],
        "capacity": 10, "weight": 2, "timezone": "Asia/Kolkata", "workingHours": None, "territory": None, "territoryOn": False,
        "active": True, "password": "",
    }
    base.update(over)
    return base


def purge(email: str):
    with SessionLocal() as db:
        for u in db.scalars(select(User).where(User.email == email)).all():
            db.execute(delete(Broker).where(Broker.userId == u.id))
            db.delete(u)
        db.execute(delete(Broker).where(Broker.email == email))
        db.commit()


@pytest.fixture()
def created(owner):
    email = "pytest.broker@skyline.demo"
    purge(email)
    res = owner.post("/api/admin/brokers", json=payload())
    assert res.status_code == 200, res.text
    yield res.json() | {"email": email}
    purge(email)


# ------------------------------------------------------------------ auth


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/admin/brokers"),
        ("get", "/api/admin/brokers/new"),
        ("get", "/api/admin/brokers/x"),
        ("post", "/api/admin/brokers"),
        ("put", "/api/admin/brokers/x"),
        ("post", "/api/admin/brokers/x/active"),
        ("delete", "/api/admin/brokers/x"),
    ],
)
def test_unauthenticated_401_and_broker_403(priya, method, path):
    assert getattr(client(), method)(path).status_code == 401
    assert getattr(priya, method)(path).status_code == 403


# ------------------------------------------------------------------ read


def test_list(owner):
    data = owner.get("/api/admin/brokers").json()
    assert data["maxBrokers"] is None and data["atCap"] is False  # Enterprise
    assert data["count"] == len(data["brokers"]) >= 1
    active = [b["active"] for b in data["brokers"]]
    assert active == sorted(active, reverse=True)
    b = next(b for b in data["brokers"] if b["email"] == "priya@skyline.demo")
    assert {"load", "won", "onShift", "self", "languages", "workingHours", "territory"} <= set(b)
    assert b["self"] is False and isinstance(b["load"], int)
    with SessionLocal() as db:
        open_leads = len(db.scalars(select(Lead.id).where(Lead.brokerId == b["id"], Lead.status.in_(["NEW", "CONTACTED", "VIEWING", "NEGOTIATION"]))).all())
    assert b["load"] == open_leads
    assert b["territory"] is not None


def test_new_defaults(owner, small_owner):
    data = owner.get("/api/admin/brokers/new").json()
    assert data["atCap"] is False
    assert data["initial"]["role"] == "BROKER" and data["initial"]["capacity"] == 15
    assert data["initial"]["workingHours"]["sat"] == ["10:00", "17:00"] and data["initial"]["workingHours"]["sun"] is None
    assert len(data["mapCenter"]) == 2
    small = small_owner.get("/api/admin/brokers/new").json()
    assert small["maxBrokers"] == 3


def test_detail(owner, small_owner):
    rows = owner.get("/api/admin/brokers").json()["brokers"]
    pr = next(b for b in rows if b["email"] == "priya@skyline.demo")
    data = owner.get(f"/api/admin/brokers/{pr['id']}").json()
    assert data["broker"]["id"] == pr["id"]
    assert data["initial"]["email"] == "priya@skyline.demo" and data["initial"]["role"] == "BROKER"
    assert data["initial"]["territoryOn"] is True and data["initial"]["password"] == ""
    assert data["isSelf"] is False and data["lockedRole"] is None
    assert small_owner.get(f"/api/admin/brokers/{pr['id']}").json() == {"error": "Team member not found", "code": "not_found"}
    assert owner.get("/api/admin/brokers/nope").status_code == 404


# ------------------------------------------------------------------ validation


@pytest.mark.parametrize(
    "over,message",
    [
        ({"name": "A"}, "Name is required"),
        ({"name": ""}, "Name is required"),
        ({"name": "x" * 81}, "Name must be 80 characters or fewer"),
        ({"email": "nope"}, "Enter a valid email"),
        ({"role": "OWNER"}, "Role is not valid"),
        ({"phone": "1" * 31}, "Phone must be 30 characters or fewer"),
        ({"capacity": 0}, "Capacity must be at least 1"),
        ({"capacity": 501}, "Capacity must be at most 500"),
        ({"capacity": "abc"}, "Capacity must be a number"),
        ({"capacity": 2.5}, "Capacity must be a whole number"),
        ({"weight": 11}, "Weight must be at most 10"),
        ({"languages": "English"}, "Languages must be a list"),
        ({"areas": [""]}, "Areas contains an invalid entry"),
        ({"workingHours": {"xyz": ["09:00", "10:00"]}}, "Invalid working hours"),
        ({"workingHours": {"mon": ["19:00", "09:00"]}}, "Opening time must be before closing time"),
        ({"workingHours": {"mon": ["9:00", "10:00"]}}, "Working hours must be HH:MM times"),
        ({"territory": {"type": "Polygon", "coordinates": [[[1, 2], [3, 4]]]}}, "Territory must be a polygon with at least three points"),
        ({"territory": "somewhere"}, "Territory must be a polygon with at least three points"),
        ({"active": "yes"}, "Active must be true or false"),
    ],
)
def test_validation_messages(owner, over, message):
    res = owner.post("/api/admin/brokers", json=payload(**over))
    assert res.status_code == 400
    assert res.json()["error"] == message


# ------------------------------------------------------------------ create / update / delete


def test_create_with_temp_password_and_login(owner, created):
    assert created["ok"] is True and created["tempPassword"] and len(created["tempPassword"]) >= 8
    with SessionLocal() as db:
        b = db.get(Broker, created["id"])
        assert b.languages == ["English"]  # unknown languages filtered
        assert b.workingHours is None and b.territory is None
        assert b.phone == "+91 90000 00000" and b.bio is None and b.photoUrl is None
        u = db.get(User, b.userId)
        assert u.role == "BROKER" and u.email == "pytest.broker@skyline.demo" and u.tenantId == b.tenantId
    login(client(), "pytest.broker@skyline.demo", created["tempPassword"])

    dup = owner.post("/api/admin/brokers", json=payload())
    assert dup.status_code == 400 and dup.json()["error"] == "A user with this email already exists"
    upper = owner.post("/api/admin/brokers", json=payload(email="  PYTEST.Broker@Skyline.demo "))
    assert upper.json()["error"] == "A user with this email already exists"


def test_create_with_explicit_password_and_short_password(owner):
    email = "pytest.pw@skyline.demo"
    purge(email)
    try:
        short = owner.post("/api/admin/brokers", json=payload(email=email, password="short"))
        assert short.json() == {"error": "Password must be at least 8 characters"}
        with SessionLocal() as db:
            assert db.scalars(select(User).where(User.email == email)).first() is None

        res = owner.post("/api/admin/brokers", json=payload(email=email, password="s3cret-pass", role="ADMIN", workingHours={"mon": ["09:00", "17:00"], "sun": None}, territory=SQUARE))
        assert res.status_code == 200 and res.json()["tempPassword"] is None
        login(client(), email, "s3cret-pass")
        with SessionLocal() as db:
            b = db.get(Broker, res.json()["id"])
            assert b.territory == SQUARE and b.workingHours == {"mon": ["09:00", "17:00"], "sun": None}
            assert db.get(User, b.userId).role == "ADMIN"
    finally:
        purge(email)


def test_update(owner, created):
    bid = created["id"]
    res = owner.put(
        f"/api/admin/brokers/{bid}",
        json=payload(name="Pytest Renamed", role="ADMIN", capacity=7, workingHours={"mon": ["08:00", "12:00"]}, territory=SQUARE, password="brand-new-pass", active=False),
    )
    assert res.json() == {"ok": True, "id": bid}
    detail = owner.get(f"/api/admin/brokers/{bid}").json()
    assert detail["initial"]["name"] == "Pytest Renamed" and detail["initial"]["role"] == "ADMIN"
    assert detail["initial"]["territoryOn"] is True and detail["initial"]["workingHours"] == {"mon": ["08:00", "12:00"]}
    assert detail["broker"]["active"] is False and detail["broker"]["capacity"] == 7
    login(client(), "pytest.broker@skyline.demo", "brand-new-pass")

    # clearing optional JSON fields stores SQL NULL
    owner.put(f"/api/admin/brokers/{bid}", json=payload(workingHours=None, territory=None))
    with SessionLocal() as db:
        from sqlalchemy import text

        row = db.execute(text('select "workingHours" is null, "territory" is null from "Broker" where id = :i'), {"i": bid}).one()
        assert tuple(row) == (True, True)


def test_update_errors(owner, created, small_owner):
    bid = created["id"]
    clash = owner.put(f"/api/admin/brokers/{bid}", json=payload(email="priya@skyline.demo"))
    assert clash.status_code == 400 and clash.json()["error"] == "Another user already uses this email"
    assert owner.put(f"/api/admin/brokers/{bid}", json=payload(password="abc")).json()["error"] == "Password must be at least 8 characters"
    assert owner.put("/api/admin/brokers/missing", json=payload()).json() == {"error": "Team member not found"}
    assert small_owner.put(f"/api/admin/brokers/{bid}", json=payload()).json() == {"error": "Team member not found"}
    # nothing was half-applied
    assert owner.get(f"/api/admin/brokers/{bid}").json()["initial"]["email"] == "pytest.broker@skyline.demo"


def test_set_active(owner, created, small_owner):
    bid = created["id"]
    assert owner.post(f"/api/admin/brokers/{bid}/active", json={"active": False}).json() == {"ok": True}
    assert owner.get(f"/api/admin/brokers/{bid}").json()["broker"]["active"] is False
    assert owner.post(f"/api/admin/brokers/{bid}/active", json={"active": True}).json() == {"ok": True}
    assert small_owner.post(f"/api/admin/brokers/{bid}/active", json={"active": False}).json() == {"error": "Team member not found"}
    assert owner.get(f"/api/admin/brokers/{bid}").json()["broker"]["active"] is True


def test_delete_counts_orphans_and_removes_login(owner, created, small_owner):
    bid = created["id"]
    with SessionLocal() as db:
        tenant_id = db.get(Broker, bid).tenantId
        lead = Lead(tenantId=tenant_id, name="Orphan", email="orphan@example.com", brokerId=bid, status="NEW")
        done = Lead(tenantId=tenant_id, name="Done", email="done@example.com", brokerId=bid, status="WON")
        db.add_all([lead, done])
        db.commit()
        lead_ids = [lead.id, done.id]
    try:
        assert small_owner.delete(f"/api/admin/brokers/{bid}").json() == {"error": "Team member not found"}
        res = owner.delete(f"/api/admin/brokers/{bid}")
        assert res.json() == {"ok": True, "orphaned": 1}
        assert owner.get(f"/api/admin/brokers/{bid}").status_code == 404
        with SessionLocal() as db:
            assert db.scalars(select(User).where(User.email == "pytest.broker@skyline.demo")).first() is None
            assert {r.brokerId for r in db.scalars(select(Lead).where(Lead.id.in_(lead_ids))).all()} == {None}
        assert owner.delete(f"/api/admin/brokers/{bid}").json() == {"error": "Team member not found"}
    finally:
        with SessionLocal() as db:
            db.execute(delete(Lead).where(Lead.id.in_(lead_ids)))
            db.commit()


def test_cannot_delete_self_or_owner(owner, created):
    # self: log in as the freshly created ADMIN and try to remove own account
    bid = created["id"]
    owner.put(f"/api/admin/brokers/{bid}", json=payload(role="ADMIN", password="admin-pass-1"))
    me = login(client(), "pytest.broker@skyline.demo", "admin-pass-1")
    listing = me.get("/api/admin/brokers").json()["brokers"]
    assert next(b for b in listing if b["id"] == bid)["self"] is True
    res = me.delete(f"/api/admin/brokers/{bid}")
    assert res.status_code == 400 and res.json()["error"] == "You cannot remove your own account"
    assert me.get(f"/api/admin/brokers/{bid}").json()["isSelf"] is True

    # owner: attach a temporary broker row to the owner login
    with SessionLocal() as db:
        owner_user = db.scalars(select(User).where(User.email == "owner@skyline.demo")).first()
        if db.scalars(select(Broker).where(Broker.userId == owner_user.id)).first():
            pytest.skip("owner already has a broker profile")
        tmp = Broker(tenantId=owner_user.tenantId, userId=owner_user.id, name="Tmp Owner", email="owner@skyline.demo")
        db.add(tmp)
        db.commit()
        tmp_id = tmp.id
    try:
        assert owner.delete(f"/api/admin/brokers/{tmp_id}").json()["error"] == "You cannot remove your own account"
        res = me.delete(f"/api/admin/brokers/{tmp_id}")
        assert res.status_code == 400 and res.json()["error"] == "The account owner cannot be removed"
        assert owner.get(f"/api/admin/brokers/{tmp_id}").json()["lockedRole"] == "Owner"
        # the owner's role is never downgraded through the form
        owner.put(f"/api/admin/brokers/{tmp_id}", json=payload(name="Tmp Owner", email="owner@skyline.demo", role="BROKER"))
        with SessionLocal() as db:
            assert db.scalars(select(User).where(User.email == "owner@skyline.demo")).first().role == "OWNER"
    finally:
        with SessionLocal() as db:
            db.execute(delete(Broker).where(Broker.id == tmp_id))
            db.commit()


def test_seat_cap_on_starter_plan(small_owner):
    emails = [f"pytest.seat{i}@urbannest.demo" for i in range(3)]
    for e in emails:
        purge(e)
    try:
        data = small_owner.get("/api/admin/brokers").json()
        assert data["maxBrokers"] == 3
        results = [small_owner.post("/api/admin/brokers", json=payload(email=e, name=f"Seat {i}", password="seat-pass-1")) for i, e in enumerate(emails)]
        assert any(r.status_code == 400 and r.json()["error"] == "Your plan allows 3 broker seats. Upgrade to add more." for r in results)
        now = small_owner.get("/api/admin/brokers").json()
        assert now["atCap"] is True and now["count"] == 3
        assert small_owner.get("/api/admin/brokers/new").json()["atCap"] is True
    finally:
        for e in emails:
            purge(e)
