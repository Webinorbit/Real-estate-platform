import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.db import SessionLocal
from app.main import app
from app.models import Broker, Lead, Property, Tenant, Tour, User
from app.security import hash_password
from tests.team_helpers import uid

PASSWORD = "reset-pass-123"


@pytest.fixture
def shop():
    """A throwaway client with an owner (who also has a broker profile), an admin, a broker, a listing + tour and a lead."""
    slug = f"reset-{uid()}"
    with SessionLocal() as db:
        t = Tenant(slug=slug, name=f"Reset Realty {slug}", plan="PRO")
        db.add(t)
        db.flush()
        users = {}
        for role in ("OWNER", "ADMIN", "BROKER"):
            u = User(tenantId=t.id, email=f"{role.lower()}@{slug}.test", name=role.title(), role=role, passwordHash=hash_password(PASSWORD))
            db.add(u)
            db.flush()
            db.add(Broker(tenantId=t.id, userId=u.id, name=role.title(), email=u.email))
            users[role] = u.email
        p = Property(tenantId=t.id, slug=f"home-{slug}", title="Reset Home", listingType="SALE", type="APARTMENT", status="ACTIVE",
                     price=100, locality="Powai", city="Mumbai", lat=19.1, lng=72.9)
        db.add(p)
        db.flush()
        db.add(Tour(tenantId=t.id, propertyId=p.id, title="Reset tour", kind="EXTERNAL", externalUrl="https://example.com/t", published=True))
        db.add(Lead(tenantId=t.id, name="Reset Lead", email="lead@example.com"))
        db.commit()
        name, tid = t.name, t.id
    yield {"slug": slug, "name": name, "id": tid, **users}
    with SessionLocal() as db:
        db.execute(delete(Tenant).where(Tenant.id == tid))
        db.commit()


def login(shop, email):
    c = TestClient(app, headers={"x-tenant-host": f"{shop['slug']}.localhost"})
    assert c.post("/api/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    return c


def counts(tid):
    with SessionLocal() as db:
        n = lambda m: db.scalar(select(func.count(m.id)).where(m.tenantId == tid))  # noqa: E731
        return {"listings": n(Property), "tours": n(Tour), "leads": n(Lead), "brokers": n(Broker), "users": n(User)}


def test_only_owner_can_reset_and_name_must_match(shop):
    assert login(shop, shop["ADMIN"]).post("/api/admin/data/reset", json={"confirm": shop["name"]}).status_code == 403
    assert login(shop, shop["BROKER"]).post("/api/admin/data/reset", json={"confirm": shop["name"]}).status_code == 403
    res = login(shop, shop["OWNER"]).post("/api/admin/data/reset", json={"confirm": "wrong name"})
    assert res.status_code == 400 and "Type the business name" in res.json()["error"]
    assert counts(shop["id"]) == {"listings": 1, "tours": 1, "leads": 1, "brokers": 3, "users": 3}


def test_owner_resets_everything_but_keeps_own_login_and_branding(shop):
    owner = login(shop, shop["OWNER"])
    res = owner.post("/api/admin/data/reset", json={"confirm": f"  {shop['name'].upper()} "})
    assert res.status_code == 200, res.text
    assert res.json()["deleted"] == {"listings": 1, "tours": 1, "leads": 1, "team": 2, "routingRules": 0}
    assert counts(shop["id"]) == {"listings": 0, "tours": 0, "leads": 0, "brokers": 1, "users": 1}
    with SessionLocal() as db:
        assert db.scalar(select(Tenant.name).where(Tenant.id == shop["id"])) == shop["name"]
    assert owner.get("/api/admin/settings").status_code == 200  # still signed in


def test_partial_reset_keeps_unchecked_parts(shop):
    res = login(shop, shop["OWNER"]).post("/api/admin/data/reset", json={"confirm": shop["name"], "listings": True, "leads": False, "team": False})
    assert res.status_code == 200
    assert counts(shop["id"]) == {"listings": 0, "tours": 0, "leads": 1, "brokers": 3, "users": 3}
    assert login(shop, shop["OWNER"]).post("/api/admin/data/reset", json={"confirm": shop["name"], "listings": False, "leads": False, "team": False}).status_code == 400
