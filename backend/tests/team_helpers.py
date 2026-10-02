import secrets
from contextlib import contextmanager
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import SessionLocal, bind_tenant
from app.main import app
from app.models import Broker, Lead, Tenant, User, utcnow

PASSWORD = "demo1234"


def uid() -> str:
    return secrets.token_hex(4)


def login(email: str, tenant: str = "skyline", password: str = PASSWORD) -> TestClient:
    client = TestClient(app, headers={"x-tenant-host": f"{tenant}.localhost"})
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return client


def anonymous(tenant: str = "skyline") -> TestClient:
    return TestClient(app, headers={"x-tenant-host": f"{tenant}.localhost"})


@contextmanager
def tenant_db(slug: str = "skyline"):
    with SessionLocal() as db:
        tenant = db.scalars(select(Tenant).where(Tenant.slug == slug)).one()
        bind_tenant(db, tenant.id)
        yield db, tenant


def broker_of(email: str, slug: str = "skyline") -> Broker:
    with tenant_db(slug) as (db, tenant):
        user = db.scalars(select(User).where(User.tenantId == tenant.id, User.email == email)).one()
        return db.scalars(select(Broker).where(Broker.userId == user.id)).one()


def make_lead(slug: str = "skyline", **fields) -> str:
    with tenant_db(slug) as (db, _):
        lead = Lead(**{"name": f"pytest-{uid()}", "email": "pytest@example.com", **fields})
        db.add(lead)
        db.commit()
        return lead.id


def delete_leads(ids, slug: str = "skyline") -> None:
    with tenant_db(slug) as (db, _):
        db.execute(delete(Lead).where(Lead.id.in_(list(ids))))
        db.commit()


def get_lead(lead_id: str, slug: str = "skyline") -> Lead:
    with tenant_db(slug) as (db, _):
        return db.scalars(select(Lead).where(Lead.id == lead_id)).one()


def minutes_ago(n: float):
    return utcnow() - timedelta(minutes=n)
