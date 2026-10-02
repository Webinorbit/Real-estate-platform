import pytest
from sqlalchemy import select

from app.errors import UserError
from app.models import Property
from app.plans import PLAN_DEFS
from app.routers import admin_import
from tests.props_helpers import PREFIX, make_client, purge_test_properties, tag, tenant_db

API = "/api/admin/import"


@pytest.fixture(scope="module")
def owner():
    return make_client(email="owner@skyline.demo")


@pytest.fixture(scope="module")
def priya():
    return make_client(email="priya@skyline.demo")


@pytest.fixture(scope="module")
def un_owner():
    return make_client("urbannest.localhost", "owner@urbannest.demo")


@pytest.fixture(autouse=True)
def cleanup(monkeypatch):
    monkeypatch.setattr(admin_import, "sleep", lambda _s: None)
    yield
    purge_test_properties("skyline")
    purge_test_properties("urbannest")


def row(title: str, index: int = 0, **over) -> dict:
    base = {
        "__index": index, "title": title, "description": "", "listingType": "SALE", "type": "APARTMENT", "status": "ACTIVE", "price": 5000000,
        "priceUnit": None, "beds": 2, "baths": 2, "areaSqft": 800, "yearBuilt": "", "furnishing": "", "parking": 0, "floor": "", "totalFloors": "",
        "facing": "", "address": "", "locality": "Importville", "city": "Importcity", "state": "", "postalCode": "", "lat": 19.1, "lng": 72.9,
        "amenities": ["Gym", "Lift"], "images": [], "featured": False,
    }
    base.update(over)
    return base


def batch(c, rows):
    return c.post(f"{API}/batch", json={"rows": rows})


def stored(title: str) -> Property | None:
    with tenant_db() as db:
        return db.scalars(select(Property).where(Property.title == title)).first()


# ---------------------------------------------------------------- access

def test_access_rules(priya, un_owner):
    anon = make_client()
    assert anon.get(API).status_code == 401
    assert anon.post(f"{API}/batch", json={"rows": []}).status_code == 401

    assert priya.get(API).status_code == 403
    assert priya.post(f"{API}/batch", json={"rows": []}).status_code == 403

    for res in (un_owner.get(API), un_owner.post(f"{API}/batch", json={"rows": [row("x")]})):
        assert res.status_code == 403
        assert res.json()["code"] == "plan_locked" and res.json()["feature"] == "csvImport"


def test_page_data(owner):
    data = owner.get(API).json()
    assert data["remaining"] is None and data["cap"] is None and data["count"] >= 0


def test_remaining_reflects_the_plan(owner, monkeypatch):
    count = owner.get(API).json()["count"]
    monkeypatch.setitem(PLAN_DEFS["ENTERPRISE"], "maxListings", count + 7)
    data = owner.get(API).json()
    assert data["remaining"] == 7 and data["cap"] == count + 7
    monkeypatch.setitem(PLAN_DEFS["ENTERPRISE"], "maxListings", 0)
    assert owner.get(API).json()["remaining"] == 0


# ---------------------------------------------------------------- batches

def test_batch_size_limits(owner):
    assert batch(owner, [row("x", i) for i in range(13)]).json() == {"error": "Batch too large"}
    assert owner.post(f"{API}/batch", json={"rows": "nope"}).status_code == 400
    assert owner.post(f"{API}/batch", json={}).json() == {"error": "Batch too large"}
    assert batch(owner, []).json() == {"ok": True, "results": []}


def test_imports_valid_rows_and_reports_bad_ones(owner):
    t = tag()
    good, good2 = f"{PREFIX} Good {t}", f"{PREFIX} Rent {t}"
    rows = [
        row(good, 3),
        row("", 4),
        row(f"{PREFIX} no loc {t}", 5, locality=""),
        row(good2, 6, listingType="RENT", priceUnit="month", price="85000", beds="3", amenities=["Gym", "Bogus"], status="PENDING"),
        row(f"{PREFIX} bad price {t}", 7, price=0),
    ]
    res = batch(owner, rows)
    assert res.status_code == 200
    out = res.json()
    assert out["ok"] is True
    by_index = {r["index"]: r for r in out["results"]}
    assert by_index[3] == {"index": 3, "ok": True} and by_index[6] == {"index": 6, "ok": True}
    assert by_index[4]["ok"] is False and by_index[4]["error"].startswith("title: Give the listing a title")
    assert by_index[5] == {"index": 5, "ok": False, "error": "locality: Locality is required"}
    assert by_index[7] == {"index": 7, "ok": False, "error": "price: Too small: expected number to be >=1"}

    p = stored(good)
    assert p and p.slug == good.lower().replace(" ", "-") and p.lat == 19.1 and p.amenities == ["Gym", "Lift"] and p.tenantId
    r = stored(good2)
    assert r.listingType == "RENT" and r.price == 85000 and r.beds == 3 and r.amenities == ["Gym"] and r.status == "PENDING"
    assert stored(f"{PREFIX} no loc {t}") is None and stored(f"{PREFIX} bad price {t}") is None


def test_duplicate_titles_get_numbered_slugs(owner):
    title = f"{PREFIX} Dup {tag()}"
    out = batch(owner, [row(title, 0), row(title, 1)]).json()
    assert [r["ok"] for r in out["results"]] == [True, True]
    slugs = sorted(p.slug for p in tenant_properties(title))
    base = title.lower().replace(" ", "-")
    assert slugs == [base, f"{base}-2"]
    assert batch(owner, [row(title, 0)]).json()["results"][0]["ok"] is True
    assert sorted(p.slug for p in tenant_properties(title)) == [base, f"{base}-2", f"{base}-3"]


def tenant_properties(title: str) -> list[Property]:
    with tenant_db() as db:
        return list(db.scalars(select(Property).where(Property.title == title)).all())


def test_plan_limit_applies_within_a_batch(owner, monkeypatch):
    count = owner.get(API).json()["count"]
    monkeypatch.setitem(PLAN_DEFS["ENTERPRISE"], "maxListings", count + 1)
    t = tag()
    out = batch(owner, [row(f"{PREFIX} A {t}", 0), row(f"{PREFIX} B {t}", 1)]).json()["results"]
    assert out[0] == {"index": 0, "ok": True}
    assert out[1] == {"index": 1, "ok": False, "error": "Listing limit reached for your plan"}
    assert stored(f"{PREFIX} B {t}") is None


def test_missing_coordinates_are_geocoded(owner, monkeypatch):
    calls = []

    def fake_geocode(r, *args):
        calls.append(r)
        return {"lat": 12.5, "lng": 77.25} if r["locality"] != "Nowhere" else None

    monkeypatch.setattr(admin_import, "geocode", fake_geocode)
    slept = []
    monkeypatch.setattr(admin_import, "sleep", slept.append)

    t = tag()
    out = batch(
        owner,
        [
            row(f"{PREFIX} G1 {t}", 0, lat=None, lng=None, address="1 Main St"),
            row(f"{PREFIX} G2 {t}", 1, lat="", lng=""),
            row(f"{PREFIX} G3 {t}", 2, lat=None, lng=None, locality="Nowhere"),
            row(f"{PREFIX} G4 {t}", 3),
        ],
    ).json()["results"]
    assert [r["ok"] for r in out] == [True, True, False, True]
    assert out[2]["error"] == "Could not find coordinates for this address. Add latitude and longitude."
    assert len(calls) == 3 and len(slept) == 2  # pause between geocoded rows, not before the first
    p = stored(f"{PREFIX} G1 {t}")
    assert (p.lat, p.lng) == (12.5, 77.25)
    assert (stored(f"{PREFIX} G4 {t}").lat) == 19.1


def test_geocode_uses_nominatim_settings(monkeypatch):
    seen = {}

    class Res:
        is_success = True

        def json(self):
            return [{"lat": "1.5", "lon": "2.5"}]

    def fake_get(url, params=None, headers=None, timeout=None):
        seen.update(url=url, params=params, headers=headers)
        return Res()

    monkeypatch.setenv("NOMINATIM_URL", "http://geo.test")
    monkeypatch.setattr(admin_import.httpx, "get", fake_get)
    pos = admin_import.geocode({"address": "A", "locality": "B", "city": "C", "state": ""}, "me@x.com")
    assert pos == {"lat": 1.5, "lng": 2.5}
    assert seen["url"] == "http://geo.test/search" and seen["params"] == {"q": "A, B, C", "format": "jsonv2", "limit": "1"}
    assert seen["headers"]["User-Agent"] == "WebInOrbit-RealEstate/1.0 (me@x.com)"

    def boom(*a, **k):
        raise admin_import.httpx.ConnectError("down")

    monkeypatch.setattr(admin_import.httpx, "get", boom)
    assert admin_import.geocode({"city": "C"}, None) is None


def test_images_are_rehosted_and_broken_links_skipped(owner, monkeypatch):
    fetched = []

    def fake_import(url, tenant_id, *args):
        fetched.append((url, tenant_id))
        if "broken" in url:
            raise UserError("Link is not an image")
        return f"/uploads/{tenant_id}/{url.rsplit('/', 1)[-1]}"

    monkeypatch.setattr(admin_import, "import_remote_image", fake_import)
    t = tag()
    images = [{"url": f"https://img.test/{i}.jpg", "alt": ""} for i in range(8)]
    images[1] = {"url": "https://img.test/broken.jpg", "alt": ""}
    out = batch(owner, [row(f"{PREFIX} Img {t}", 0, images=images)]).json()["results"]
    assert out == [{"index": 0, "ok": True}]
    assert len(fetched) == 6  # only the first six are attempted
    p = stored(f"{PREFIX} Img {t}")
    assert [i["url"].rsplit("/", 1)[-1] for i in p.images] == ["0.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]
    assert all(i["alt"] == "" and i["url"].startswith(f"/uploads/{p.tenantId}/") for i in p.images)


def test_non_https_image_links_never_block_the_listing(owner):
    t = tag()
    out = batch(owner, [row(f"{PREFIX} Plain {t}", 0, images=[{"url": "http://insecure.test/a.jpg"}, {"url": "https://127.0.0.1/a.jpg"}])]).json()
    assert out["results"] == [{"index": 0, "ok": True}]
    assert stored(f"{PREFIX} Plain {t}").images == []


def test_a_failing_row_does_not_poison_the_rest(owner):
    t = tag()
    out = batch(owner, ["not a row", row(f"{PREFIX} After {t}", 1)]).json()["results"]
    assert out[0]["ok"] is False and out[1] == {"index": 1, "ok": True}


def test_rows_are_stamped_with_the_callers_tenant(owner):
    t = tag()
    batch(owner, [row(f"{PREFIX} Tenant {t}", 0)])
    me = owner.get("/api/auth/context").json()["tenant"]["id"]
    assert stored(f"{PREFIX} Tenant {t}").tenantId == me


def test_preview_maps_and_checks_rows(owner, un_owner):
    csv_rows = [
        {"Name": "Preview flat", "For": "rent", "Price": "Rs 85,000", "BHK": "3 BHK", "Locality": "Bandra", "City": "Mumbai", "Lat": "19.05", "Longitude": "72.8"},
        {"Name": "No place", "Price": "100"},
    ]
    res = owner.post(f"{API}/preview", json={"rows": csv_rows})
    assert res.status_code == 200
    out = res.json()
    assert out["mapping"]["title"] == "Name" and out["mapping"]["lng"] == "Longitude"
    first, second = out["rows"]
    assert first["check"] == {"ok": True, "needsGeocode": False}
    assert first["row"]["listingType"] == "RENT" and first["row"]["priceUnit"] == "month" and first["row"]["price"] == 85000 and first["row"]["beds"] == 3
    assert second["check"]["ok"] is False and second["check"]["error"].startswith("locality:")
    assert un_owner.post(f"{API}/preview", json={"rows": csv_rows}).status_code == 403
