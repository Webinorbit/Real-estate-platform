"""Routing console, settings, plan and platform tenants endpoints.

Everything that mutates data runs against a throw-away tenant created through the SUPER endpoint and deleted afterwards,
so the seeded demo tenants are only ever read.
"""

import json
import secrets

import pytest
from sqlalchemy import delete

from app.db import SessionLocal
from app.models import Tenant
from tests.conftest import make_client

SUPER = "super@webinorbit.demo"


class Sandbox:
    def __init__(self):
        self.slug = f"pytest-{secrets.token_hex(4)}"
        self.email = f"owner@{self.slug}.test"
        self.password = "pytest-pass-123"
        self.host = f"{self.slug}.localhost"
        self.id: str | None = None

    def owner(self):
        return make_client(self.email, self.host, self.password)

    def super_(self):
        return make_client(SUPER, self.host)


@pytest.fixture(scope="module")
def platform():
    return make_client(SUPER)


@pytest.fixture(scope="module")
def sandbox(platform):
    box = Sandbox()
    res = platform.post(
        "/api/admin/tenants",
        json={"name": f"Pytest {box.slug}", "slug": box.slug, "plan": "PRO", "ownerEmail": box.email, "ownerName": "Pytest Owner", "password": box.password, "city": "Dubai"},
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True, "slug": box.slug, "email": box.email, "password": box.password}
    listing = platform.get("/api/admin/tenants").json()["tenants"]
    box.id = next(t["id"] for t in listing if t["slug"] == box.slug)
    try:
        yield box
    finally:
        with SessionLocal() as db:
            db.execute(delete(Tenant).where(Tenant.id == box.id))
            db.commit()


@pytest.fixture(scope="module")
def owner(sandbox):
    return sandbox.owner()


@pytest.fixture(scope="module")
def sandbox_super(sandbox):
    return sandbox.super_()


def rule_body(**over):
    body = {
        "name": f"pytest-{secrets.token_hex(3)}", "enabled": True, "strategy": "ROUND_ROBIN", "brokerIds": [], "requireAvailable": True,
        "matchLanguage": False, "useTerritory": False, "slaMinutes": "",
        "conditions": {"listingTypes": [], "propertyTypes": [], "minPrice": "", "maxPrice": "", "cities": [], "localities": [], "languages": [], "sources": [], "polygon": None},
    }
    cond = over.pop("conditions", {})
    body["conditions"].update(cond)
    body.update(over)
    return body


def err(res, status=400):
    assert res.status_code == status, res.text
    return res.json()["error"]


class TestAuthorization:
    def test_anonymous_is_rejected_everywhere(self, anon):
        for method, path in [
            ("get", "/api/admin/routing"), ("post", "/api/admin/routing/rules"), ("post", "/api/admin/routing/simulate"),
            ("get", "/api/admin/settings"), ("put", "/api/admin/settings"), ("get", "/api/admin/plan"), ("put", "/api/admin/plan"),
            ("get", "/api/admin/tenants"), ("post", "/api/admin/tenants"),
        ]:
            assert getattr(anon, method)(path).status_code == 401, (method, path)

    def test_broker_cannot_use_staff_endpoints(self):
        broker = make_client("priya@skyline.demo")
        for method, path in [("get", "/api/admin/routing"), ("get", "/api/admin/settings"), ("put", "/api/admin/settings"), ("get", "/api/admin/plan"), ("put", "/api/admin/plan")]:
            res = getattr(broker, method)(path)
            assert res.status_code == 403 and res.json()["code"] == "forbidden", (method, path)

    def test_only_super_reaches_tenants_console(self, owner):
        for method, path in [("get", "/api/admin/tenants"), ("post", "/api/admin/tenants"), ("put", "/api/admin/tenants/x/active"), ("put", "/api/admin/tenants/x/plan")]:
            assert getattr(owner, method)(path).status_code == 403
        assert make_client("owner@skyline.demo").get("/api/admin/tenants").status_code == 403

    def test_starter_plan_locks_routing(self):
        res = make_client("owner@urbannest.demo", "urbannest.localhost").get("/api/admin/routing")
        assert res.status_code == 403
        assert res.json()["code"] == "plan_locked" and res.json()["feature"] == "routingRules"

    def test_session_of_another_tenant_is_not_valid_here(self, owner):
        heritage = make_client("owner@heritage.demo", "heritage.localhost")
        assert heritage.get("/api/admin/routing").status_code == 200
        heritage.headers["x-tenant-host"] = "skyline.localhost"
        assert heritage.get("/api/admin/routing").status_code == 401


class TestRouting:
    def test_page_data_on_seeded_tenant(self):
        res = make_client("owner@skyline.demo").get("/api/admin/routing")
        assert res.status_code == 200
        data = res.json()
        assert set(data) == {"rules", "brokers", "properties", "audit", "mapCenter", "currency", "locale", "allowSla", "slaMinutes", "maxReassigns"}
        assert data["allowSla"] is True
        assert data["brokers"] and set(data["brokers"][0]) == {"id", "name", "photoUrl"}
        assert data["properties"] and set(data["properties"][0]) == {"id", "title"}
        assert [r["priority"] for r in data["rules"]] == sorted(r["priority"] for r in data["rules"])
        assert all(set(r) == {"id", "name", "priority", "enabled", "conditions", "strategy", "brokerIds", "requireAvailable", "matchLanguage", "useTerritory", "slaMinutes"} for r in data["rules"])
        assert len(data["audit"]) <= 40
        for a in data["audit"]:
            assert set(a) == {"id", "createdAt", "leadId", "leadName", "kind", "brokerName", "ruleName", "strategy", "reasons"}
            assert a["leadName"] and isinstance(a["reasons"], list) and a["createdAt"].endswith("Z")
        json.dumps(data)

    def test_rule_lifecycle(self, owner):
        broker_id = owner.get("/api/admin/routing").json()["brokers"][0]["id"]
        body = rule_body(
            strategy="LEAST_LOADED", brokerIds=[broker_id], slaMinutes="30", matchLanguage=True,
            conditions={"listingTypes": ["SALE"], "propertyTypes": ["VILLA"], "minPrice": "1000", "maxPrice": 5000000, "cities": ["  Dubai "], "languages": ["English", "Klingon"], "sources": ["ENQUIRY"]},
        )
        res = owner.post("/api/admin/routing/rules", json=body)
        assert res.status_code == 200 and res.json()["ok"] is True
        first = res.json()["id"]
        second = owner.post("/api/admin/routing/rules", json=rule_body()).json()["id"]

        rules = {r["id"]: r for r in owner.get("/api/admin/routing").json()["rules"]}
        assert rules[first]["priority"] == 10 and rules[second]["priority"] == 20
        saved = rules[first]
        assert saved["strategy"] == "LEAST_LOADED" and saved["slaMinutes"] == 30 and saved["matchLanguage"] is True and saved["brokerIds"] == [broker_id]
        assert saved["conditions"] == {
            "listingTypes": ["SALE"], "propertyTypes": ["VILLA"], "minPrice": 1000, "maxPrice": 5000000, "cities": ["Dubai"], "languages": ["English"], "sources": ["ENQUIRY"],
        }
        assert rules[second]["conditions"] == {} and rules[second]["slaMinutes"] is None

        updated = rule_body(name="pytest-renamed", enabled=False, strategy="WEIGHTED")
        assert owner.put(f"/api/admin/routing/rules/{first}", json=updated).json() == {"ok": True, "id": first}
        row = {r["id"]: r for r in owner.get("/api/admin/routing").json()["rules"]}[first]
        assert (row["name"], row["enabled"], row["strategy"], row["conditions"], row["brokerIds"], row["priority"]) == ("pytest-renamed", False, "WEIGHTED", {}, [], 10)

        assert owner.put(f"/api/admin/routing/rules/{first}/enabled", json={"enabled": True}).json() == {"ok": True}
        assert {r["id"]: r for r in owner.get("/api/admin/routing").json()["rules"]}[first]["enabled"] is True

        assert owner.post("/api/admin/routing/rules/reorder", json={"ids": [second, first]}).json() == {"ok": True}
        order = [(r["id"], r["priority"]) for r in owner.get("/api/admin/routing").json()["rules"]]
        assert order == [(second, 10), (first, 20)]

        assert owner.delete(f"/api/admin/routing/rules/{first}").json() == {"ok": True}
        assert owner.delete(f"/api/admin/routing/rules/{second}").json() == {"ok": True}
        assert owner.get("/api/admin/routing").json()["rules"] == []

    def test_validation_messages(self, owner):
        url = "/api/admin/routing/rules"
        assert err(owner.post(url, json=rule_body(name=" a "))) == "Name the rule"
        assert err(owner.post(url, json=rule_body(name="x" * 81)))
        assert err(owner.post(url, json=rule_body(strategy="RANDOM")))
        assert err(owner.post(url, json=rule_body(slaMinutes=0)))
        assert err(owner.post(url, json=rule_body(slaMinutes=1441)))
        assert err(owner.post(url, json=rule_body(brokerIds=["no-such-broker-id"]))) == "One of the selected brokers no longer exists"
        assert err(owner.post(url, json=rule_body(conditions={"minPrice": 10, "maxPrice": 5}))) == "Minimum price is higher than maximum price"
        assert err(owner.post(url, json=rule_body(conditions={"listingTypes": ["LEASE"]})))
        assert err(owner.post(url, json=rule_body(conditions={"minPrice": -1})))
        assert err(owner.post(url, json=rule_body(conditions={"polygon": {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 0]]]}}))) == "Map area must have at least three points"
        assert err(owner.post(url, json=rule_body(conditions={"polygon": {"type": "Point"}}))) == "Map area must have at least three points"
        assert err(owner.put("/api/admin/routing/rules/nope", json=rule_body()), 404) == "Rule not found"
        assert err(owner.put("/api/admin/routing/rules/nope/enabled", json={"enabled": True}), 404) == "Rule not found"
        assert err(owner.delete("/api/admin/routing/rules/nope"), 404) == "Rule not found"
        assert owner.get("/api/admin/routing").json()["rules"] == []

    def test_polygon_is_kept_and_reorder_is_validated(self, owner):
        ring = [[72.8, 19.0], [72.9, 19.0], [72.9, 19.1], [72.8, 19.0]]
        polygon = {"type": "Polygon", "coordinates": [ring]}
        rule_id = owner.post("/api/admin/routing/rules", json=rule_body(conditions={"polygon": polygon})).json()["id"]
        try:
            stored = owner.get("/api/admin/routing").json()["rules"][0]
            assert stored["conditions"] == {"polygon": polygon}
            for ids in ([], [rule_id, rule_id], ["nope"], "nope", None):
                assert err(owner.post("/api/admin/routing/rules/reorder", json={"ids": ids})) == "Invalid rule order"
        finally:
            owner.delete(f"/api/admin/routing/rules/{rule_id}")

    def test_rules_of_other_tenants_are_invisible(self, owner):
        skyline = make_client("owner@skyline.demo")
        skyline_rule = skyline.get("/api/admin/routing").json()["rules"]
        if not skyline_rule:
            pytest.skip("no seeded rule on skyline")
        rid = skyline_rule[0]["id"]
        assert err(owner.put(f"/api/admin/routing/rules/{rid}", json=rule_body()), 404) == "Rule not found"
        assert owner.delete(f"/api/admin/routing/rules/{rid}").status_code == 404
        assert err(owner.post("/api/admin/routing/rules/reorder", json={"ids": [rid]})) == "Invalid rule order"
        assert any(r["id"] == rid for r in skyline.get("/api/admin/routing").json()["rules"])

    def test_simulator(self, owner):
        res = owner.post("/api/admin/routing/simulate", json={"propertyId": "", "source": "bogus", "language": "", "budget": "abc", "now": None})
        assert res.status_code == 200, res.text
        result = res.json()["result"]
        assert result["brokerId"] and result["broker"]["name"] == "Pytest Owner" and result["fallback"] is True
        assert isinstance(result["reasons"], list) and isinstance(result["trace"], list) and result["candidates"]
        assert result["property"] is None

        night = owner.post("/api/admin/routing/simulate", json={"source": "CALLBACK", "language": "English", "budget": "5000000", "now": "2030-01-06T21:30:00Z"})
        assert night.status_code == 200
        assert err(owner.post("/api/admin/routing/simulate", json={"now": "not a date"})) == "Invalid date"

    def test_simulator_with_property_and_rule_on_seeded_tenant(self):
        client = make_client("owner@skyline.demo")
        page = client.get("/api/admin/routing").json()
        res = client.post("/api/admin/routing/simulate", json={"propertyId": page["properties"][0]["id"], "source": "ENQUIRY", "now": "2030-01-07T10:00:00Z"})
        assert res.status_code == 200, res.text
        result = res.json()["result"]
        assert result["property"]["id"] == page["properties"][0]["id"]
        json.dumps(result)


class TestSettings:
    def form(self, client):
        initial = client.get("/api/admin/settings").json()["initial"]
        initial["heroImages"] = [h["url"] for h in initial["heroImages"]]
        return initial

    def test_get_shape(self, owner, sandbox):
        data = owner.get("/api/admin/settings").json()
        assert set(data) == {"initial", "tenant", "features", "planFeatures", "rootDomain", "options"}
        assert data["features"] == {"slaAutomation": True, "webhooks": False, "customDomain": True}
        assert data["initial"]["name"] == f"Pytest {sandbox.slug}" and data["initial"]["tagline"] == "Find a home you will love"
        assert data["initial"]["heroImages"] == [] and data["initial"]["socials"] == {}
        assert data["tenant"]["slug"] == sandbox.slug and data["rootDomain"] == "localhost"
        assert data["initial"]["mapLat"] == pytest.approx(25.2048)

    def test_save_roundtrip(self, owner):
        form = self.form(owner)
        form.update(
            tagline="  pytest tagline  ", about="", contactEmail="hello@example.com", primaryColor="#112233", currency="USD", mapZoom="9.5",
            heroImages=["https://img.example.com/a.jpg", "https://img.example.com/b.jpg"], socials={"instagram": "https://instagram.com/x", "facebook": "", "bogus": "ignored"},
            slaMinutes="20", maxReassigns=3, analyticsSiteId="wio_test",
        )
        assert owner.put("/api/admin/settings", json=form).json() == {"ok": True}
        after = owner.get("/api/admin/settings").json()
        initial = after["initial"]
        assert initial["tagline"] == "pytest tagline" and initial["about"] == "" and initial["primaryColor"] == "#112233"
        assert initial["currency"] == "USD" and after["tenant"]["locale"] == "en-US" and initial["mapZoom"] == 9.5
        assert [h["url"] for h in initial["heroImages"]] == ["https://img.example.com/a.jpg", "https://img.example.com/b.jpg"]
        assert after["tenant"]["heroImageUrl"] == "https://img.example.com/a.jpg,https://img.example.com/b.jpg"
        assert initial["socials"] == {"instagram": "https://instagram.com/x"} and initial["slaMinutes"] == 20 and initial["maxReassigns"] == 3
        form["heroImages"] = []
        assert owner.put("/api/admin/settings", json=form).status_code == 200
        assert owner.get("/api/admin/settings").json()["tenant"]["heroImageUrl"] is None

    def test_validation_messages(self, owner):
        base = self.form(owner)
        put = lambda **over: owner.put("/api/admin/settings", json={**base, **over})  # noqa: E731
        assert err(put(name="x")) == "Business name is required"
        assert err(put(primaryColor="red")) == "Colors must be a 6-digit hex value"
        assert err(put(accentColor="#12345")) == "Colors must be a 6-digit hex value"
        assert err(put(heroVideoUrl="ftp://x")) == "Links must start with https://"
        assert err(put(socials={"x": "javascript:alert(1)"})) == "Links must start with https://"
        assert err(put(contactEmail="not-an-email")) == "Enter a valid contact email"
        assert err(put(currency="XYZ"))
        assert err(put(areaUnit="acre"))
        assert err(put(fontHeading="comic"))
        assert err(put(mapLat=91)) and err(put(mapLng=-181)) and err(put(mapZoom=1))
        assert err(put(slaMinutes=0)) and err(put(slaMinutes=1.5)) and err(put(maxReassigns=11))
        assert err(put(tagline="x" * 141))
        assert err(put(heroImages=["a"] * 7))

    def test_plan_gates_and_domain_checks(self, owner, sandbox, sandbox_super):
        base = self.form(owner)
        put = lambda **over: owner.put("/api/admin/settings", json={**base, **over})  # noqa: E731

        assert err(put(webhookUrl="https://hooks.example.com/x")) == "Webhooks are available on the Enterprise plan"
        assert err(put(customDomain="localhost")) == "Enter a valid domain such as homes.yourbrand.com"
        assert err(put(customDomain="homes.localhost")) == "Use a domain you own, not localhost"

        domain = f"homes.{sandbox.slug}.example.com"
        assert put(customDomain=f"HTTPS://WWW.{domain.upper()}/path?x=1").json() == {"ok": True}
        assert owner.get("/api/admin/settings").json()["initial"]["customDomain"] == domain

        other = make_client("owner@heritage.demo", "heritage.localhost")
        other_form = self.form(other)
        taken = other.put("/api/admin/settings", json={**other_form, "customDomain": domain})
        assert err(taken) == "That domain is already connected to another site"

        assert sandbox_super.put("/api/admin/plan", json={"plan": "STARTER"}).status_code == 200
        try:
            assert err(put(customDomain="other.example.com")) == "Custom domains are available on Pro and Enterprise"
            assert put(customDomain=domain).status_code == 200
            assert put(customDomain="").status_code == 200
            assert owner.get("/api/admin/settings").json()["initial"]["customDomain"] == ""

            assert sandbox_super.put("/api/admin/plan", json={"plan": "ENTERPRISE"}).status_code == 200
            assert put(webhookUrl="https://hooks.example.com/x").status_code == 200
            assert owner.get("/api/admin/settings").json()["initial"]["webhookUrl"] == "https://hooks.example.com/x"
            assert put(webhookUrl="").status_code == 200
        finally:
            assert sandbox_super.put("/api/admin/plan", json={"plan": "PRO"}).status_code == 200


class TestPlan:
    def test_get_as_owner_and_super(self, owner, sandbox, sandbox_super):
        data = owner.get("/api/admin/plan").json()
        assert data["tenant"] == {"id": sandbox.id, "name": f"Pytest {sandbox.slug}", "plan": "PRO"}
        assert data["canSwitch"] is False
        assert data["current"]["key"] == "PRO" and data["current"]["maxListings"] == 250 and data["current"]["priceHint"] == "For growing agencies"
        assert [u["label"] for u in data["usage"]] == ["Listings", "Broker seats"]
        assert data["usage"][0] == {"label": "Listings", "used": 0, "cap": 250}
        assert data["usage"][1] == {"label": "Broker seats", "used": 1, "cap": 25}
        assert [p["key"] for p in data["plans"]] == ["STARTER", "PRO", "ENTERPRISE"]
        enterprise = data["plans"][2]
        assert enterprise["maxListings"] is None and enterprise["maxBrokers"] is None and enterprise["webhooks"] is True
        assert data["plans"][0]["routingRules"] is False
        assert sandbox_super.get("/api/admin/plan").json()["canSwitch"] is True

    def test_only_super_may_switch(self, owner, sandbox_super):
        res = owner.put("/api/admin/plan", json={"plan": "ENTERPRISE"})
        assert res.status_code == 403 and res.json()["error"] == "Only WebInOrbit can change plans"
        assert owner.get("/api/admin/plan").json()["tenant"]["plan"] == "PRO"

        assert err(sandbox_super.put("/api/admin/plan", json={"plan": "GOLD"})) == "Unknown plan"
        assert err(sandbox_super.put("/api/admin/plan", json={})) == "Unknown plan"
        assert sandbox_super.put("/api/admin/plan", json={"plan": "STARTER"}).json() == {"ok": True, "plan": "STARTER"}
        try:
            assert owner.get("/api/admin/plan").json()["current"]["maxListings"] == 25
            locked = owner.get("/api/admin/routing")
            assert locked.status_code == 403 and locked.json()["code"] == "plan_locked"
        finally:
            sandbox_super.put("/api/admin/plan", json={"plan": "PRO"})
        assert owner.get("/api/admin/routing").status_code == 200


class TestTenants:
    def test_list(self, platform, sandbox):
        data = platform.get("/api/admin/tenants").json()
        assert data["root"] == "localhost"
        by_slug = {t["slug"]: t for t in data["tenants"]}
        assert {"skyline", "heritage", "urbannest", sandbox.slug} <= set(by_slug)
        mine = by_slug[sandbox.slug]
        assert set(mine) == {"id", "name", "slug", "customDomain", "plan", "active", "createdAt", "properties", "brokers", "leads", "url"}
        assert (mine["plan"], mine["active"], mine["properties"], mine["brokers"], mine["leads"]) == ("PRO", True, 0, 1, 0)
        assert mine["url"] == f"/?tenant={sandbox.slug}" and mine["createdAt"].endswith("Z")
        assert by_slug["skyline"]["properties"] > 0 and by_slug["skyline"]["plan"] == "ENTERPRISE"
        created = [t["createdAt"] for t in data["tenants"]]
        assert created == sorted(created)

    def test_super_works_from_any_tenant_host(self, sandbox):
        client = make_client(SUPER, "urbannest.localhost")
        assert sandbox.slug in {t["slug"] for t in client.get("/api/admin/tenants").json()["tenants"]}

    def test_create_validation(self, platform, sandbox):
        post = lambda **over: platform.post("/api/admin/tenants", json={"name": "Pytest Two", "slug": f"pytest-{secrets.token_hex(4)}", "ownerEmail": "a@b.co", **over})  # noqa: E731
        assert err(post(name="x")) == "Business name is required"
        assert err(post(slug="Bad Slug")).startswith("Slug must be 3-40 characters")
        assert err(post(slug="admin")).startswith("Slug must be 3-40 characters")
        assert err(post(plan="GOLD")).startswith("Plan must be one of")
        assert err(post(ownerEmail="nope")) == "A valid owner email is required"
        assert err(post(slug=sandbox.slug)) == f"The slug \u201c{sandbox.slug}\u201d is already taken"
        assert err(post(password="short")) == "Password must be at least 8 characters"
    def test_suspend_and_plan_change(self, platform, sandbox):
        url = f"/api/admin/tenants/{sandbox.id}"
        find = lambda: next(t for t in platform.get("/api/admin/tenants").json()["tenants"] if t["id"] == sandbox.id)  # noqa: E731
        try:
            assert platform.put(f"{url}/active", json={"active": False}).json() == {"ok": True}
            assert find()["active"] is False
            assert platform.put(f"{url}/plan", json={"plan": "ENTERPRISE"}).json() == {"ok": True}
            assert find()["plan"] == "ENTERPRISE"
        finally:
            platform.put(f"{url}/active", json={"active": True})
            platform.put(f"{url}/plan", json={"plan": "PRO"})
        assert (find()["active"], find()["plan"]) == (True, "PRO")

        assert err(platform.put(f"{url}/plan", json={"plan": "GOLD"})) == "Unknown plan"
        assert err(platform.put("/api/admin/tenants/missing/plan", json={"plan": "PRO"}), 404) == "Client not found"
        assert err(platform.put("/api/admin/tenants/missing/active", json={"active": True}), 404) == "Client not found"
