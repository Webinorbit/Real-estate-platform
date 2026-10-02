import pytest

from tests.conftest import make_client


def test_tenant_resolution_by_subdomain_and_default():
    assert make_client().get("/api/public/tenant").json()["tenant"]["slug"] == "skyline"
    heritage = make_client(tenant_host="heritage.localhost").get("/api/public/tenant").json()
    assert heritage["tenant"]["slug"] == "heritage"
    assert "webhookUrl" not in heritage["tenant"]
    assert heritage["features"]["tours"] is True


def test_search_is_tenant_isolated(anon):
    sky = {p["id"] for p in anon.get("/api/properties").json()["items"]}
    her = make_client(tenant_host="heritage.localhost").get("/api/properties").json()["items"]
    assert sky and her and not sky & {p["id"] for p in her}


def test_search_filters(anon):
    res = anon.get("/api/properties?lt=RENT&beds=2").json()
    assert all(p["listingType"] == "RENT" and p["beds"] >= 2 for p in res["items"])


def test_property_detail_and_missing(anon):
    slug = anon.get("/api/properties").json()["items"][0]["slug"]
    res = anon.get(f"/api/public/properties/{slug}")
    assert res.status_code == 200 and res.json()["property"]["slug"] == slug
    assert anon.get("/api/public/properties/does-not-exist").status_code == 404
    other = make_client(tenant_host="heritage.localhost").get(f"/api/public/properties/{slug}")
    assert other.status_code == 404


def test_tours_gated_by_plan():
    assert make_client(tenant_host="urbannest.localhost").get("/api/public/tours").status_code == 404
    assert make_client().get("/api/public/tours").status_code == 200


def test_lead_validation_and_honeypot(anon):
    bad = anon.post("/api/leads", json={"name": "A", "email": "nope"})
    assert bad.status_code == 422 and set(bad.json()["fields"]) == {"name", "email"}
    assert anon.post("/api/leads", json={"name": "Bot", "email": "bot@example.com", "website": "spam"}).json() == {"ok": True}


def test_lead_is_created_and_routed(anon):
    prop = anon.get("/api/properties").json()["items"][0]
    res = anon.post("/api/leads", json={"name": "Pytest Buyer", "email": "pytest-buyer@example.com", "propertyId": prop["id"], "message": "hi"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ok"] and body["leadId"]

    from app.db import SessionLocal
    from app.models import Lead

    with SessionLocal() as db:
        lead = db.get(Lead, body["leadId"])
        assert lead and lead.email == "pytest-buyer@example.com"
        db.delete(lead)
        db.commit()


def test_admin_requires_login_and_tenant_binding(anon):
    assert anon.get("/api/auth/context").status_code == 401
    owner = make_client("owner@skyline.demo")
    assert owner.get("/api/auth/context").status_code == 200
    # a skyline session must be useless on another tenant's host
    cookie = owner.cookies.get("re_session")
    other = make_client(tenant_host="heritage.localhost")
    other.cookies.set("re_session", cookie)
    assert other.get("/api/auth/context").status_code == 401


def test_login_rejects_bad_password(anon):
    res = anon.post("/api/auth/login", json={"email": "owner@skyline.demo", "password": "wrong-password"})
    assert res.status_code == 401


@pytest.mark.parametrize("path", ["/api/cron/sla"])
def test_cron_requires_secret(anon, path):
    assert anon.get(path).status_code == 401
