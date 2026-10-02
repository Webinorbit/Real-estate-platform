"""Shared helpers for the properties / import / dashboard API tests."""

import secrets
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import SessionLocal, bind_tenant
from app.main import app
from app.models import Lead, Property, Tenant

PASSWORD = "demo1234"
PREFIX = "ZZTEST"


def tag() -> str:
    return secrets.token_hex(3)


def make_client(host: str = "skyline.localhost", email: str | None = None) -> TestClient:
    c = TestClient(app, headers={"x-tenant-host": host})
    if email:
        res = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert res.status_code == 200, res.text
    return c


def tenant_id(slug: str) -> str:
    with SessionLocal() as db:
        return db.scalars(select(Tenant.id).where(Tenant.slug == slug)).one()


@contextmanager
def tenant_db(slug: str = "skyline"):
    with SessionLocal() as db:
        bind_tenant(db, db.scalars(select(Tenant.id).where(Tenant.slug == slug)).one())
        yield db


def purge_test_properties(slug: str) -> None:
    """Removes every property created by these tests (and the leads pointing at them)."""
    with tenant_db(slug) as db:
        ids = db.scalars(select(Property.id).where(Property.title.like(f"{PREFIX}%"))).all()
        if ids:
            db.execute(delete(Lead).where(Lead.propertyId.in_(ids), Lead.name.like(f"{PREFIX}%")))
            db.execute(delete(Property).where(Property.id.in_(ids)))
            db.commit()


def prop_payload(title: str = "", **over) -> dict:
    base = {
        "title": title, "description": "Test listing", "listingType": "SALE", "type": "APARTMENT", "status": "DRAFT",
        "price": 1234567, "priceUnit": "", "beds": 2, "baths": 2, "areaSqft": 900, "yearBuilt": "", "furnishing": "",
        "parking": 1, "floor": "", "totalFloors": "", "facing": "", "address": "1 Test Street", "locality": "Testville",
        "city": "Testcity", "state": "", "postalCode": "", "lat": 19.07, "lng": 72.87, "amenities": ["Gym", "Not an amenity"],
        "images": [{"url": "/uploads/x.jpg", "alt": "front"}], "videoUrl": "", "featured": False, "listingBrokerId": None,
    }
    base.update(over)
    return base
