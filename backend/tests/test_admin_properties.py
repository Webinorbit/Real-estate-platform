import json
import math
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import SessionLocal
from app.main import app
from app.plans import PLAN_DEFS
from app.property_schema import parse_property_input
from app.errors import UserError
from app.routers import admin_import
from app.import_csv import auto_map, build_row, check_row

PASSWORD = "demo1234"


def login(email: str, tenant: str = "skyline") -> TestClient:
    c = TestClient(app, headers={"x-tenant-host": f"{tenant}.localhost"})
    res = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return c


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo")


@pytest.fixture(scope="module")
def broker():
    return login("priya@skyline.demo")


@pytest.fixture(scope="module")
def heritage():
    return login("owner@heritage.demo", "heritage")


@pytest.fixture(scope="module")
def urbannest():
    return login("owner@urbannest.demo", "urbannest")


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with SessionLocal() as s:
        s.execute(text("""DELETE FROM "Property" WHERE title LIKE 'pytest-%'"""))
        s.commit()


def tag() -> str:
    return f"pytest-{uuid.uuid4().hex[:8]}"


def payload(title: str, **over) -> dict:
    base = {
        "title": title, "description": "d", "listingType": "SALE", "type": "VILLA", "status": "DRAFT", "price": "1250000",
        "priceUnit": "", "beds": "3", "baths": 2, "areaSqft": 1200, "yearBuilt": "", "furnishing": "", "parking": 1,
        "floor": "", "totalFloors": "", "facing": "", "address": "1 Test Rd", "locality": "Juhu", "city": "Mumbai",
        "state": "", "postalCode": "", "lat": 19.1, "lng": 72.8, "amenities": ["Gym", "Not An Amenity"],
        "images": [{"url": "/x.jpg", "alt": ""}], "videoUrl": "", "featured": False, "listingBrokerId": None,
    }
    return {**base, **over}


def sql(query: str, **params):
    with SessionLocal() as s:
        return s.execute(text(query), params).all()


def create(c: TestClient, title: str, **over) -> str:
    res = c.post("/api/admin/properties", json=payload(title, **over))
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_authorization_on_every_endpoint(broker, heritage):
    anon = TestClient(app, headers={"x-tenant-host": "skyline.localhost"})
    calls = [
        ("get", "/api/admin/properties", None), ("get", "/api/admin/properties/new", None), ("get", "/api/admin/properties/abc", None),
        ("post", "/api/admin/properties", payload("pytest-x")), ("put", "/api/admin/properties/abc", payload("pytest-x")),
        ("delete", "/api/admin/properties/abc", None), ("post", "/api/admin/properties/abc/status", {"status": "ACTIVE"}),
        ("post", "/api/admin/properties/abc/featured", {"featured": True}),
        ("get", "/api/admin/import", None), ("post", "/api/admin/import/batch", []), ("post", "/api/admin/import/preview", {"rows": []}),
    ]
    for method, url, body in calls:
        kw = {"json": body} if body is not None else {}
        assert getattr(anon, method)(url, **kw).status_code == 401, (method, url)
        res = getattr(broker, method)(url, **kw)
        assert res.status_code == 403 and res.json()["code"] == "forbidden", (method, url, res.text)

    stolen = TestClient(app, headers={"x-tenant-host": "skyline.localhost"}, cookies=heritage.cookies)
    assert stolen.get("/api/admin/properties").status_code == 401
    assert sql("""SELECT 1 FROM "Property" WHERE title LIKE 'pytest-%'""") == []


def test_crud_lifecycle_slugs_status_featured(owner):
    t = tag()
    pid = create(owner, t, listingType="RENT", priceUnit="week")
    row = sql('SELECT slug, "tenantId", price, beds, amenities, "priceUnit", featured, "yearBuilt" FROM "Property" WHERE id=:i', i=pid)[0]
    assert row.slug == t and row.price == 1250000 and row.beds == 3 and row.amenities == ["Gym"] and row.priceUnit == "week"
    assert row.yearBuilt is None
    assert row.tenantId == sql("""SELECT id FROM "Tenant" WHERE slug='skyline'""")[0].id

    twin = create(owner, t)
    assert sql('SELECT slug FROM "Property" WHERE id=:i', i=twin)[0].slug == f"{t}-2"
    third = create(owner, t)
    assert sql('SELECT slug FROM "Property" WHERE id=:i', i=third)[0].slug == f"{t}-3"

    got = owner.get(f"/api/admin/properties/{pid}").json()
    assert got["property"]["id"] == pid and got["property"]["createdAt"].endswith("Z")
    assert got["initial"]["priceUnit"] == "week" and got["initial"]["yearBuilt"] == "" and got["initial"]["listingBrokerId"] == ""
    assert got["initial"]["images"] == [{"url": "/x.jpg", "alt": ""}]
    assert got["tours"] == [] and {"id", "name"} == set(got["brokers"][0]) and got["features"]["tours"] is True
    assert set(got["tenant"]) == {"currency", "areaUnit", "mapLat", "mapLng", "mapZoom"}

    same = owner.put(f"/api/admin/properties/{pid}", json=payload(t, description="changed"))
    assert same.status_code == 200 and same.json() == {"ok": True, "id": pid}
    assert sql('SELECT slug, description FROM "Property" WHERE id=:i', i=pid)[0] == (t, "changed")

    renamed = f"{t} renamed"
    assert owner.put(f"/api/admin/properties/{pid}", json=payload(renamed)).status_code == 200
    assert sql('SELECT slug FROM "Property" WHERE id=:i', i=pid)[0].slug == f"{t}-renamed"

    assert owner.put(f"/api/admin/properties/{twin}", json=payload(renamed)).status_code == 200
    assert sql('SELECT slug FROM "Property" WHERE id=:i', i=twin)[0].slug == f"{t}-renamed-2"

    assert owner.post(f"/api/admin/properties/{pid}/status", json={"status": "SOLD"}).json() == {"ok": True}
    assert sql('SELECT status FROM "Property" WHERE id=:i', i=pid)[0].status == "SOLD"
    bad = owner.post(f"/api/admin/properties/{pid}/status", json={"status": "NOPE"})
    assert bad.status_code == 400 and bad.json() == {"error": "Unknown status"}

    assert owner.post(f"/api/admin/properties/{pid}/featured", json={"featured": True}).status_code == 200
    assert sql('SELECT featured FROM "Property" WHERE id=:i', i=pid)[0].featured is True
    assert owner.post(f"/api/admin/properties/{pid}/featured", json={"featured": False}).status_code == 200
    assert sql('SELECT featured FROM "Property" WHERE id=:i', i=pid)[0].featured is False

    assert owner.delete(f"/api/admin/properties/{pid}").json() == {"ok": True}
    assert sql('SELECT 1 FROM "Property" WHERE id=:i', i=pid) == []
    gone = owner.delete(f"/api/admin/properties/{pid}")
    assert gone.status_code == 400 and gone.json() == {"error": "Property not found"}
    assert owner.get(f"/api/admin/properties/{pid}").status_code == 404
    assert owner.put(f"/api/admin/properties/{pid}", json=payload(t)).json() == {"error": "Property not found"}


def test_listing_filters_pagination_and_counts(owner):
    t = tag()
    ids = [create(owner, f"{t} {i}", status="ACTIVE" if i % 2 else "DRAFT", locality=f"Zz{t[-4:]}") for i in range(3)]
    owner.post(f"/api/admin/properties/{ids[0]}/featured", json={"featured": True})

    res = owner.get("/api/admin/properties", params={"q": f"  {t} "}).json()
    assert res["total"] == 3 and len(res["rows"]) == 3 and res["page"] == 1 and res["pages"] == 1 and res["pageSize"] == 20
    row = res["rows"][0]
    assert row["_count"] == {"leads": 0, "tours": 0} and row["listingBroker"] is None
    assert {"id", "slug", "images", "updatedAt", "views", "status", "price", "priceUnit", "featured"} <= set(row)
    assert [r["updatedAt"] for r in res["rows"]] == sorted((r["updatedAt"] for r in res["rows"]), reverse=True)
    assert res["all"] >= 3 and res["counts"]["DRAFT"] >= 2 and sum(res["counts"].values()) == res["all"]
    assert res["cap"] is None and res["atCap"] is False and res["plan"] == "ENTERPRISE"

    assert owner.get("/api/admin/properties", params={"search": t.upper()}).json()["total"] == 3
    only = owner.get("/api/admin/properties", params={"q": t, "status": "ACTIVE"}).json()
    assert only["total"] == 1 and only["status"] == "ACTIVE"
    assert owner.get("/api/admin/properties", params={"q": t, "status": "bogus"}).json()["total"] == 3
    assert owner.get("/api/admin/properties", params={"q": f"Zz{t[-4:]}"}).json()["total"] == 3
    assert owner.get("/api/admin/properties", params={"q": "%"}).json()["total"] == 0
    assert owner.get("/api/admin/properties", params={"q": t, "page": "2"}).json()["rows"] == []
    assert owner.get("/api/admin/properties", params={"q": t, "page": "junk"}).json()["page"] == 1

    everything = owner.get("/api/admin/properties").json()
    assert len(everything["rows"]) <= 20 and everything["pages"] == math.ceil(everything["total"] / 20)


def test_listing_agent_leads_and_tours_counts(owner):
    t = tag()
    broker_row = sql("""SELECT b.id, b.name FROM "Broker" b JOIN "Tenant" t ON t.id=b."tenantId" WHERE t.slug='skyline' LIMIT 1""")[0]
    pid = create(owner, t, listingBrokerId=broker_row.id)
    with SessionLocal() as s:
        tid = s.execute(text("""SELECT id FROM "Tenant" WHERE slug='skyline'""")).scalar()
        s.execute(text('INSERT INTO "Lead"(id,"tenantId","propertyId",name,email,status,source,escalated,"reassignCount","createdAt","updatedAt") VALUES (:i,:t,:p,\'pytest lead\',\'p@x.io\',\'NEW\',\'ENQUIRY\',false,0,now(),now())'), {"i": f"pytestlead{t[-8:]}", "t": tid, "p": pid})
        s.execute(text('INSERT INTO "Tour"(id,"tenantId","propertyId",title,kind,published,"autoRotate","createdAt","updatedAt") VALUES (:i,:t,:p,\'pytest tour\',\'PANORAMA\',true,true,now(),now())'), {"i": f"pytesttour{t[-8:]}", "t": tid, "p": pid})
        s.commit()
    try:
        row = owner.get("/api/admin/properties", params={"q": t}).json()["rows"][0]
        assert row["_count"] == {"leads": 1, "tours": 1} and row["listingBroker"] == {"name": broker_row.name}
        assert owner.get(f"/api/admin/properties/{pid}").json()["tours"] == [{"id": f"pytesttour{t[-8:]}", "title": "pytest tour", "published": True}]
        assert owner.delete(f"/api/admin/properties/{pid}").status_code == 200
        assert sql('SELECT "propertyId" FROM "Lead" WHERE id=:i', i=f"pytestlead{t[-8:]}")[0].propertyId is None
        assert sql('SELECT 1 FROM "Tour" WHERE id=:i', i=f"pytesttour{t[-8:]}") == []
    finally:
        with SessionLocal() as s:
            s.execute(text("""DELETE FROM "Lead" WHERE name='pytest lead'"""))
            s.execute(text("""DELETE FROM "Tour" WHERE title='pytest tour'"""))
            s.commit()


def test_new_page_meta(owner, urbannest):
    meta = owner.get("/api/admin/properties/new").json()
    assert meta["atCap"] is False and meta["cap"] is None and meta["initial"]["status"] == "DRAFT"
    assert meta["initial"]["lat"] == meta["tenant"]["mapLat"] and meta["initial"]["beds"] == 2 and meta["initial"]["parking"] == 1
    small = urbannest.get("/api/admin/properties/new").json()
    assert small["cap"] == 25 and small["atCap"] == (small["count"] >= 25)


def test_cross_tenant_isolation(owner, heritage):
    t = tag()
    pid = create(owner, t)
    assert heritage.get(f"/api/admin/properties/{pid}").status_code == 404
    assert heritage.put(f"/api/admin/properties/{pid}", json=payload(f"{t} hijack")).json() == {"error": "Property not found"}
    assert heritage.delete(f"/api/admin/properties/{pid}").json() == {"error": "Property not found"}
    assert heritage.post(f"/api/admin/properties/{pid}/status", json={"status": "SOLD"}).json() == {"error": "Property not found"}
    assert heritage.post(f"/api/admin/properties/{pid}/featured", json={"featured": True}).json() == {"error": "Property not found"}
    assert heritage.get("/api/admin/properties", params={"q": t}).json()["total"] == 0
    row = sql('SELECT title, status, featured FROM "Property" WHERE id=:i', i=pid)[0]
    assert tuple(row) == (t, "DRAFT", False)

    other_broker = sql("""SELECT b.id FROM "Broker" b JOIN "Tenant" t ON t.id=b."tenantId" WHERE t.slug='heritage' LIMIT 1""")[0].id
    res = owner.post("/api/admin/properties", json=payload(tag(), listingBrokerId=other_broker))
    assert res.status_code == 400 and res.json() == {"error": "Listing agent not found"}
    res = owner.put(f"/api/admin/properties/{pid}", json=payload(t, listingBrokerId="does-not-exist"))
    assert res.json() == {"error": "Listing agent not found"}

    mine = sql("""SELECT b.id FROM "Broker" b JOIN "Tenant" t ON t.id=b."tenantId" WHERE t.slug='skyline' LIMIT 1""")[0].id
    assert owner.put(f"/api/admin/properties/{pid}", json=payload(t, listingBrokerId=mine)).status_code == 200
    assert sql('SELECT "listingBrokerId" FROM "Property" WHERE id=:i', i=pid)[0].listingBrokerId == mine


def test_plan_listing_cap(urbannest, monkeypatch):
    current = urbannest.get("/api/admin/properties").json()["all"]
    monkeypatch.setitem(PLAN_DEFS["STARTER"], "maxListings", current)
    before = urbannest.get("/api/admin/properties").json()
    assert before["atCap"] is True and before["cap"] == current
    res = urbannest.post("/api/admin/properties", json=payload(tag()))
    assert res.status_code == 400
    assert res.json() == {"error": f"Your starter plan allows {current} listings. Upgrade to add more."}
    assert urbannest.get("/api/admin/properties").json()["all"] == current

    monkeypatch.setitem(PLAN_DEFS["STARTER"], "maxListings", current + 1)
    pid = create(urbannest, tag())
    assert pid
    assert urbannest.post("/api/admin/properties", json=payload(tag())).status_code == 400


@pytest.mark.parametrize(
    "over, message",
    [
        ({"title": "ab"}, "Title: Give the listing a title"),
        ({"title": " ab "}, "Title: Give the listing a title"),
        ({"title": "x" * 141}, "Title: Too big: expected string to have <=140 characters"),
        ({"title": None}, "Title: Invalid input: expected string, received null"),
        ({"description": "x" * 10001}, "Description: Too big: expected string to have <=10000 characters"),
        ({"listingType": "LEASE"}, 'ListingType: Invalid option: expected one of "SALE"|"RENT"'),
        ({"type": "CASTLE"}, "Type: Invalid option: expected one of"),
        ({"status": "x"}, "Status: Invalid option: expected one of"),
        ({"price": 0}, "Price: Too small: expected number to be >=1"),
        ({"price": ""}, "Price: Too small: expected number to be >=1"),
        ({"price": "abc"}, "Price: Invalid input: expected number, received NaN"),
        ({"price": 2e12}, "Price: Too big: expected number to be <=1000000000000"),
        ({"priceUnit": "x" * 21}, "PriceUnit: Too big: expected string to have <=20 characters"),
        ({"beds": 51}, "Beds: Too big: expected number to be <=50"),
        ({"beds": 1.5}, "Beds: Invalid input: expected int, received number"),
        ({"baths": -1}, "Baths: Too small: expected number to be >=0"),
        ({"areaSqft": 1e8}, "AreaSqft: Too big: expected number to be <=10000000"),
        ({"yearBuilt": 1700}, "YearBuilt: Too small: expected number to be >=1800"),
        ({"yearBuilt": "x"}, "YearBuilt: Invalid input: expected number, received NaN"),
        ({"floor": 6000}, "Floor: Too big: expected number to be <=5000"),
        ({"totalFloors": -2}, "TotalFloors: Too small: expected number to be >=0"),
        ({"furnishing": "x" * 41}, "Furnishing: Too big: expected string to have <=40 characters"),
        ({"facing": "x" * 31}, "Facing: Too big: expected string to have <=30 characters"),
        ({"address": "x" * 241}, "Address: Too big: expected string to have <=240 characters"),
        ({"locality": "  "}, "Locality: Locality is required"),
        ({"city": ""}, "City: City is required"),
        ({"state": "x" * 81}, "State: Too big: expected string to have <=80 characters"),
        ({"postalCode": "1" * 13}, "PostalCode: Too big: expected string to have <=12 characters"),
        ({"lat": 91}, "Lat: Too big: expected number to be <=90"),
        ({"lng": -181}, "Lng: Too small: expected number to be >=-180"),
        ({"amenities": "Gym"}, "Amenities: Invalid input: expected array, received string"),
        ({"amenities": [1]}, "Amenities.0: Invalid input: expected string, received number"),
        ({"images": [{"url": ""}]}, "Images.0.url: Too small: expected string to have >=1 characters"),
        ({"images": [{"url": "a", "alt": "x" * 201}]}, "Images.0.alt: Too big: expected string to have <=200 characters"),
        ({"images": [{"url": "a"}] * 41}, "Images: Too big: expected array to have <=40 items"),
        ({"videoUrl": "ftp://nope"}, "Video link must start with https://"),
        ({"videoUrl": "x" * 401}, "VideoUrl: Too big: expected string to have <=400 characters"),
        ({"listingBrokerId": "x" * 41}, "ListingBrokerId: Too big: expected string to have <=40 characters"),
    ],
)
def test_validation_messages_match_zod(owner, over, message):
    res = owner.post("/api/admin/properties", json={**payload(tag()), **over})
    assert res.status_code == 400
    assert res.json()["error"].startswith(message), res.json()
    assert sql("""SELECT 1 FROM "Property" WHERE title LIKE 'pytest-%'""") == []


def test_schema_normalisation_and_defaults():
    data = parse_property_input({
        "title": "  Nice home  ", "listingType": "SALE", "type": "HOUSE", "status": "ACTIVE", "price": "10", "locality": " L ", "city": "C",
        "lat": "", "lng": "1.5", "beds": None, "yearBuilt": "1999", "floor": "", "furnishing": "  ", "featured": "false",
        "amenities": ["Lift", "Zzz"], "images": [{"url": "u"}], "extra": 1,
    })
    assert data["title"] == "Nice home" and data["locality"] == "L" and data["price"] == 10 and data["lat"] == 0 and data["lng"] == 1.5
    assert data["beds"] == 0 and data["yearBuilt"] == 1999 and data["floor"] is None and data["furnishing"] == ""
    assert data["featured"] is True and data["amenities"] == ["Lift"] and data["images"] == [{"url": "u", "alt": ""}]
    assert data["description"] == "" and data["address"] == "" and data["priceUnit"] is None and "extra" not in data
    with pytest.raises(UserError, match="^Form: Invalid input: expected object, received null$"):
        parse_property_input(None)
    with pytest.raises(UserError, match="^Title: Invalid input: expected string, received undefined$"):
        parse_property_input({})


def test_import_helpers_match_js():
    headers = ["Title", "For", "Property Type", "Asking Price", "BHK", "Locality", "City", "Image URLs", "Latitude", "Longitude"]
    mapping = auto_map(headers)
    assert mapping["listingType"] == "For" and mapping["price"] == "Asking Price" and mapping["beds"] == "BHK" and mapping["images"] == "Image URLs"
    row = build_row(
        {"Title": " Flat ", "For": "Lease", "Property Type": "plot", "Asking Price": "Rs 1,20,000", "BHK": "3 BHK", "Locality": "L", "City": "C",
         "Image URLs": "https://a.io/1.jpg|http://bad.io/2.jpg;https://a.io/3.jpg", "Latitude": "", "Longitude": "72.5"},
        mapping,
    )
    assert row["title"] == "Flat" and row["listingType"] == "RENT" and row["priceUnit"] == "month" and row["type"] == "PLOT"
    assert row["price"] == 120000 and row["beds"] == 3 and row["lat"] is None and row["lng"] == 72.5 and row["status"] == "ACTIVE"
    assert [i["url"] for i in row["images"]] == ["https://a.io/1.jpg", "https://a.io/3.jpg"]
    assert check_row(row) == {"ok": True, "needsGeocode": True}
    bad = check_row({**row, "title": "", "lat": 1, "lng": 2})
    assert bad == {"ok": False, "error": "title: Give the listing a title", "needsGeocode": False}


class _FakeNominatim(BaseHTTPRequestHandler):
    seen: list[str] = []

    def do_GET(self):
        _FakeNominatim.seen.append(self.path)
        hits = [] if "Nowhere" in self.path else [{"lat": "12.5", "lon": "77.25"}]
        body = json.dumps(hits).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def nominatim(monkeypatch):
    server = HTTPServer(("127.0.0.1", 0), _FakeNominatim)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("NOMINATIM_URL", f"http://127.0.0.1:{server.server_port}")
    _FakeNominatim.seen = []
    pauses = []
    monkeypatch.setattr(admin_import, "sleep", pauses.append)
    yield pauses
    server.shutdown()


def built(title: str, **over) -> dict:
    row = build_row(
        {"t": title, "p": "5000000", "l": "Indiranagar", "c": "Bengaluru", "b": "2", "a": "Gym; Lift; Zzz"},
        {"title": "t", "price": "p", "locality": "l", "city": "c", "beds": "b", "amenities": "a"},
    )
    return {**row, **over}


def test_import_page_and_preview(owner, urbannest, heritage):
    page = owner.get("/api/admin/import").json()
    assert page["remaining"] is None and page["cap"] is None and page["count"] >= 0
    assert page["fields"][0]["key"] == "title" and page["templateCsv"].startswith("title,listing type")
    locked = urbannest.get("/api/admin/import")
    assert locked.status_code == 403 and locked.json()["code"] == "plan_locked" and locked.json()["feature"] == "csvImport"
    assert urbannest.post("/api/admin/import/batch", json=[]).status_code == 403
    assert heritage.get("/api/admin/import").json()["cap"] == 250

    res = owner.post("/api/admin/import/preview", json={"headers": ["Title", "Price", "Locality", "City"], "rows": [
        {"Title": "pytest-a", "Price": "100", "Locality": "L", "City": "C"}, {"Title": "", "Price": "100", "Locality": "L", "City": "C"},
    ]})
    body = res.json()
    assert body["mapping"] == {"title": "Title", "price": "Price", "locality": "Locality", "city": "City"}
    assert body["rows"][0]["check"] == {"ok": True, "needsGeocode": True}
    assert body["rows"][1]["check"]["error"] == "title: Give the listing a title"
    assert owner.post("/api/admin/import/preview", json={"rows": [{}] * 2001}).json() == {"error": "Please split files into 2,000 rows or fewer"}


def test_import_batch_creates_rows(owner, nominatim, monkeypatch):
    t = tag()
    fetched = []

    def fake_image(url, tenant_id, kind="photo"):
        fetched.append((url, tenant_id))
        if "broken" in url:
            raise UserError("Image download failed")
        return f"/uploads/{tenant_id}/photos/fake.webp"

    monkeypatch.setattr(admin_import, "import_remote_image", fake_image)
    images = [{"url": "https://img.example/ok.jpg", "alt": ""}, {"url": "https://img.example/broken.jpg", "alt": ""}]
    rows = [
        {**built(f"{t} geo", images=images), "__index": 0},
        {**built(f"{t} geo"), "__index": 1, "lat": 10, "lng": 20},
        {**built("", ), "__index": 2},
        {**built(f"{t} lost", locality="Nowhere"), "__index": 3},
        {**built(f"{t} ex", lat=1, lng=2, status="BOGUS"), "__index": 4},
    ]
    res = owner.post("/api/admin/import/batch", json=rows)
    assert res.status_code == 200, res.text
    results = res.json()["results"]
    assert results[0] == {"index": 0, "ok": True} and results[1] == {"index": 1, "ok": True}
    assert results[2] == {"index": 2, "ok": False, "error": "title: Give the listing a title"}
    assert results[3] == {"index": 3, "ok": False, "error": "Could not find coordinates for this address. Add latitude and longitude."}
    assert results[4]["ok"] is False and results[4]["error"].startswith("status: Invalid option")

    assert nominatim == [admin_import.GEOCODE_PAUSE]
    assert len(_FakeNominatim.seen) == 2 and "q=Indiranagar%2C+Bengaluru" in _FakeNominatim.seen[0]
    assert [u for u, _ in fetched] == ["https://img.example/ok.jpg", "https://img.example/broken.jpg"]

    created = sql('SELECT slug, lat, lng, images, amenities, beds, "tenantId" FROM "Property" WHERE title LIKE :t ORDER BY slug', t=f"{t}%")
    assert [c.slug for c in created] == [f"{t}-geo", f"{t}-geo-2"]
    first = created[0]
    assert (first.lat, first.lng) == (12.5, 77.25) and first.amenities == ["Gym", "Lift"] and first.beds == 2
    assert first.images == [{"url": f"/uploads/{first.tenantId}/photos/fake.webp", "alt": ""}]
    assert (created[1].lat, created[1].lng) == (10, 20)

    wrapped = owner.post("/api/admin/import/batch", json={"rows": [{**built(f"{t} wrapped", lat=1, lng=2), "__index": 9}]}).json()
    assert wrapped["results"] == [{"index": 9, "ok": True}]


def test_import_geocode_pause_between_rows(owner, nominatim):
    t = tag()
    res = owner.post("/api/admin/import/batch", json=[built(f"{t} a"), built(f"{t} b"), built(f"{t} c", lat=1, lng=1)]).json()
    assert [r["ok"] for r in res["results"]] == [True, True, True]
    assert nominatim == [admin_import.GEOCODE_PAUSE]


def test_import_batch_limits(owner, heritage, monkeypatch):
    t = tag()
    big = owner.post("/api/admin/import/batch", json=[built(f"{t} {i}", lat=1, lng=1) for i in range(13)])
    assert big.status_code == 400 and big.json() == {"error": "Batch too large"}
    assert owner.post("/api/admin/import/batch", json={"rows": "nope"}).json() == {"error": "Batch too large"}
    assert owner.post("/api/admin/import/batch", json=[built(f"{t} {i}", lat=1, lng=1) for i in range(12)]).status_code == 200

    current = heritage.get("/api/admin/properties").json()["all"]
    monkeypatch.setitem(PLAN_DEFS["PRO"], "maxListings", current + 1)
    assert heritage.get("/api/admin/import").json()["remaining"] == 1
    res = heritage.post("/api/admin/import/batch", json=[{**built(f"{t} h{i}", lat=1, lng=1), "__index": i} for i in range(3)]).json()["results"]
    assert [r["ok"] for r in res] == [True, False, False]
    assert res[1]["error"] == "Listing limit reached for your plan"
    assert heritage.get("/api/admin/properties").json()["all"] == current + 1
    assert owner.get("/api/admin/properties", params={"q": f"{t} h"}).json()["total"] == 0
