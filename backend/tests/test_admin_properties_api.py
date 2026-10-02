import pytest
from sqlalchemy import select

from app.models import Broker, Lead, Property, Tour
from app.plans import PLAN_DEFS
from tests.props_helpers import PREFIX, make_client, prop_payload, purge_test_properties, tag, tenant_db

API = "/api/admin/properties"


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
def cleanup():
    yield
    purge_test_properties("skyline")
    purge_test_properties("urbannest")


def create(c, **over) -> str:
    res = c.post(API, json=prop_payload(f"{PREFIX} {tag()}", **over))
    assert res.status_code == 200, res.text
    assert res.json()["ok"] is True
    return res.json()["id"]


# ---------------------------------------------------------------- access control

def test_anonymous_is_401():
    anon = make_client()
    for method, url in (("get", API), ("get", f"{API}/new"), ("get", f"{API}/x"), ("post", API), ("put", f"{API}/x"), ("delete", f"{API}/x"),
                        ("post", f"{API}/x/status"), ("post", f"{API}/x/featured")):
        res = getattr(anon, method)(url)
        assert res.status_code == 401, (method, url, res.text)


def test_broker_is_forbidden(priya):
    assert priya.get(API).status_code == 403
    assert priya.get(f"{API}/new").status_code == 403
    assert priya.post(API, json=prop_payload("x")).status_code == 403
    assert priya.delete(f"{API}/whatever").status_code == 403


# ---------------------------------------------------------------- list / forms

def test_list_shape_filters_and_pagination(owner):
    ids = [create(owner, status="ACTIVE" if i % 2 else "DRAFT", locality=f"Zzloc{i}") for i in range(3)]
    data = owner.get(API).json()
    assert {"rows", "total", "page", "pages", "pageSize", "counts", "all", "cap", "atCap", "plan"} <= set(data)
    assert data["pageSize"] == 20 and data["plan"] == "ENTERPRISE" and data["cap"] is None and data["atCap"] is False
    assert data["all"] == sum(data["counts"].values()) >= 3
    row = data["rows"][0]
    assert row["_count"].keys() == {"leads", "tours"} and "images" in row and row["updatedAt"].endswith("Z")
    assert len(data["rows"]) <= 20

    # newest edits first
    assert data["rows"][0]["id"] == ids[-1]

    only_draft = owner.get(API, params={"status": "DRAFT"}).json()
    assert only_draft["rows"] and all(r["status"] == "DRAFT" for r in only_draft["rows"])
    assert owner.get(API, params={"status": "NOPE"}).json()["total"] == data["total"]

    hit = owner.get(API, params={"q": "  zzloc1 "}).json()
    assert [r["id"] for r in hit["rows"]] == [ids[1]] and hit["total"] == 1
    assert owner.get(API, params={"q": "zzloc1", "status": "ACTIVE"}).json()["total"] == 1
    assert owner.get(API, params={"q": "zzloc1", "status": "DRAFT"}).json()["total"] == 0
    assert owner.get(API, params={"q": "100%_never"}).json()["total"] == 0

    p2 = owner.get(API, params={"page": 2}).json()
    assert p2["page"] == 2 and p2["total"] == data["total"]
    assert owner.get(API, params={"page": "-4"}).json()["page"] == 1
    assert owner.get(API, params={"page": "abc"}).json()["page"] == 1


def test_list_includes_listing_broker_name(owner):
    with tenant_db() as db:
        broker = db.scalars(select(Broker).where(Broker.active.is_(True)).order_by(Broker.name)).first()
        bid, bname = broker.id, broker.name
    pid = create(owner, listingBrokerId=bid)
    row = next(r for r in owner.get(API, params={"q": PREFIX}).json()["rows"] if r["id"] == pid)
    assert row["listingBroker"] == {"name": bname}
    other = create(owner)
    row2 = next(r for r in owner.get(API, params={"q": PREFIX}).json()["rows"] if r["id"] == other)
    assert row2["listingBroker"] is None


def test_new_form_data(owner):
    data = owner.get(f"{API}/new").json()
    assert data["atCap"] is False and data["cap"] is None
    assert data["initial"]["status"] == "DRAFT" and data["initial"]["beds"] == 2 and data["initial"]["priceUnit"] == "month"
    assert set(data["tenant"]) == {"currency", "areaUnit", "mapLat", "mapLng", "mapZoom"}
    assert data["initial"]["lat"] == data["tenant"]["mapLat"]
    assert data["brokers"] and set(data["brokers"][0]) == {"id", "name"}
    assert [b["name"] for b in data["brokers"]] == sorted(b["name"] for b in data["brokers"])


def test_edit_form_data(owner):
    pid = create(owner, status="ACTIVE", floor=4, yearBuilt="2010", videoUrl="https://example.com/v")
    data = owner.get(f"{API}/{pid}").json()
    assert data["property"]["id"] == pid and data["property"]["amenities"] == ["Gym"]
    init = data["initial"]
    assert init["floor"] == 4 and init["yearBuilt"] == 2010 and init["totalFloors"] == "" and init["facing"] == ""
    assert init["priceUnit"] == "month" and init["images"] == [{"url": "/uploads/x.jpg", "alt": "front"}]
    assert init["listingBrokerId"] == "" and init["videoUrl"] == "https://example.com/v"
    assert data["tours"] == [] and data["features"]["tours"] is True and data["brokers"]
    assert owner.get(f"{API}/nope-nope-nope").status_code == 404


# ---------------------------------------------------------------- create / update / delete

def test_create_update_status_featured_delete(owner):
    title = f"{PREFIX} Sea View {tag()}"
    res = owner.post(API, json=prop_payload(title, price="2500000", beds="3", featured=False))
    assert res.status_code == 200
    pid = res.json()["id"]
    p = owner.get(f"{API}/{pid}").json()["property"]
    assert p["slug"] == title.lower().replace(" ", "-") and p["price"] == 2500000 and p["beds"] == 3
    assert p["amenities"] == ["Gym"] and p["priceUnit"] is None and p["tenantId"]

    same_title = owner.put(f"{API}/{pid}", json=prop_payload(title, status="ACTIVE", description="changed")).json()
    assert same_title == {"ok": True, "id": pid}
    after = owner.get(f"{API}/{pid}").json()["property"]
    assert after["slug"] == p["slug"] and after["status"] == "ACTIVE" and after["description"] == "changed"
    assert after["updatedAt"] >= p["updatedAt"] and after["createdAt"] == p["createdAt"]

    renamed = f"{PREFIX} Renamed {tag()}"
    assert owner.put(f"{API}/{pid}", json=prop_payload(renamed)).json()["ok"] is True
    assert owner.get(f"{API}/{pid}").json()["property"]["slug"] == renamed.lower().replace(" ", "-")

    assert owner.post(f"{API}/{pid}/status", json={"status": "SOLD"}).json() == {"ok": True}
    assert owner.get(f"{API}/{pid}").json()["property"]["status"] == "SOLD"
    bad = owner.post(f"{API}/{pid}/status", json={"status": "GONE"})
    assert bad.status_code == 400 and bad.json() == {"error": "Unknown status"}
    assert owner.post(f"{API}/{pid}/status", json={}).json() == {"error": "Unknown status"}

    assert owner.post(f"{API}/{pid}/featured", json={"featured": True}).json() == {"ok": True}
    assert owner.get(f"{API}/{pid}").json()["property"]["featured"] is True
    assert owner.post(f"{API}/{pid}/featured", json={"featured": False}).json() == {"ok": True}
    assert owner.get(f"{API}/{pid}").json()["property"]["featured"] is False

    assert owner.delete(f"{API}/{pid}").json() == {"ok": True}
    assert owner.get(f"{API}/{pid}").status_code == 404
    gone = owner.delete(f"{API}/{pid}")
    assert gone.status_code in (400, 404) and gone.json()["error"] == "Property not found"


def test_slugs_are_unique(owner):
    title = f"{PREFIX} Twin {tag()}"
    a = owner.post(API, json=prop_payload(title)).json()["id"]
    b = owner.post(API, json=prop_payload(title)).json()["id"]
    c = owner.post(API, json=prop_payload(title)).json()["id"]
    slugs = [owner.get(f"{API}/{i}").json()["property"]["slug"] for i in (a, b, c)]
    base = title.lower().replace(" ", "-")
    assert slugs == [base, f"{base}-2", f"{base}-3"]
    # renaming b to a title that collides with a's slug does not steal it
    owner.put(f"{API}/{b}", json=prop_payload(title.upper()))
    assert owner.get(f"{API}/{b}").json()["property"]["slug"] == f"{base}-2"


@pytest.mark.parametrize(
    "over,message",
    [
        ({"title": "ab"}, "Title: Give the listing a title"),
        ({"title": "x" * 141}, "Title: Too big: expected string to have <=140 characters"),
        ({"listingType": "LEASE"}, 'ListingType: Invalid option: expected one of "SALE"|"RENT"'),
        ({"price": 0}, "Price: Too small: expected number to be >=1"),
        ({"price": "abc"}, "Price: Invalid input: expected number, received NaN"),
        ({"beds": 51}, "Beds: Too big: expected number to be <=50"),
        ({"beds": 1.5}, "Beds: Invalid input: expected int, received number"),
        ({"yearBuilt": 1500}, "YearBuilt: Too small: expected number to be >=1800"),
        ({"locality": "  "}, "Locality: Locality is required"),
        ({"city": ""}, "City: City is required"),
        ({"lat": 95}, "Lat: Too big: expected number to be <=90"),
        ({"lng": -181}, "Lng: Too small: expected number to be >=-180"),
        ({"images": [{"alt": "no url"}]}, "Images.0.url: Invalid input: expected string, received undefined"),
        ({"images": [{"url": "a"}] * 41}, "Images: Too big: expected array to have <=40 items"),
        ({"videoUrl": "ftp://x"}, "Video link must start with https://"),
    ],
)
def test_validation_messages(owner, over, message):
    res = owner.post(API, json=prop_payload(**{"title": f"{PREFIX} v", **over}))
    assert res.status_code == 400 and res.json() == {"error": message}
    assert not owner.get(API, params={"q": f"{PREFIX} v"}).json()["rows"]


def test_validation_applies_to_update_and_empty_body(owner):
    pid = create(owner)
    res = owner.put(f"{API}/{pid}", json=prop_payload("ab"))
    assert res.status_code == 400 and res.json()["error"] == "Title: Give the listing a title"
    assert owner.post(API, json={}).json()["error"] == "Title: Invalid input: expected string, received undefined"


def test_coercions_match_the_old_schema(owner):
    pid = owner.post(
        API,
        json=prop_payload(f"{PREFIX} {tag()}", price="99.5", floor="", yearBuilt=None, furnishing="  Semi  ", featured="false", beds=None,
                          priceUnit="month", postalCode=" 400001 "),
    ).json()["id"]
    p = owner.get(f"{API}/{pid}").json()["property"]
    assert p["price"] == 99.5 and p["floor"] is None and p["yearBuilt"] is None and p["furnishing"] == "Semi"
    assert p["featured"] is True  # JS `Boolean("false")`
    assert p["beds"] == 0 and p["priceUnit"] == "month" and p["postalCode"] == "400001"


def test_listing_broker_must_belong_to_the_tenant(owner, un_owner):
    assert owner.post(API, json=prop_payload(f"{PREFIX} b", listingBrokerId="does-not-exist-1")).json() == {"error": "Listing agent not found"}
    # a broker of another tenant is not visible either
    other_broker = un_owner.get("/api/admin/brokers").json()["brokers"][0]["id"]
    assert owner.post(API, json=prop_payload(f"{PREFIX} b", listingBrokerId=other_broker)).json() == {"error": "Listing agent not found"}
    with tenant_db() as db:
        own = db.scalars(select(Broker.id).limit(1)).first()
    pid = create(owner, listingBrokerId=own)
    assert owner.get(f"{API}/{pid}").json()["property"]["listingBrokerId"] == own


# ---------------------------------------------------------------- tenant isolation

def test_cross_tenant_ids_are_not_found(owner, un_owner):
    mine = create(owner)
    theirs = un_owner.post(API, json=prop_payload(f"{PREFIX} un {tag()}")).json()["id"]

    for c, pid in ((owner, theirs), (un_owner, mine)):
        assert c.get(f"{API}/{pid}").status_code == 404
        put = c.put(f"{API}/{pid}", json=prop_payload(f"{PREFIX} hijack"))
        assert put.json() == {"error": "Property not found"}
        assert c.delete(f"{API}/{pid}").json() == {"error": "Property not found"}
        assert c.post(f"{API}/{pid}/status", json={"status": "SOLD"}).json() == {"error": "Property not found"}
        assert c.post(f"{API}/{pid}/featured", json={"featured": True}).json() == {"error": "Property not found"}

    # nothing changed
    assert owner.get(f"{API}/{mine}").json()["property"]["status"] == "DRAFT"
    assert un_owner.get(f"{API}/{theirs}").json()["property"]["title"].startswith(f"{PREFIX} un")
    assert mine not in [r["id"] for r in un_owner.get(API, params={"q": PREFIX}).json()["rows"]]
    assert theirs not in [r["id"] for r in owner.get(API, params={"q": PREFIX}).json()["rows"]]


# ---------------------------------------------------------------- plan cap

def test_listing_cap_blocks_creation(un_owner, monkeypatch):
    listing = un_owner.get(API).json()
    assert listing["plan"] == "STARTER" and listing["cap"] == 25
    assert un_owner.get(f"{API}/new").json()["cap"] == 25

    monkeypatch.setitem(PLAN_DEFS["STARTER"], "maxListings", listing["all"])
    res = un_owner.post(API, json=prop_payload(f"{PREFIX} cap"))
    assert res.status_code == 400
    assert res.json() == {"error": f"Your starter plan allows {listing['all']} listings. Upgrade to add more."}
    again = un_owner.get(API).json()
    assert again["atCap"] is True and again["cap"] == listing["all"]
    assert un_owner.get(f"{API}/new").json()["atCap"] is True

    monkeypatch.setitem(PLAN_DEFS["STARTER"], "maxListings", listing["all"] + 1)
    assert un_owner.get(API).json()["atCap"] is False
    assert un_owner.post(API, json=prop_payload(f"{PREFIX} cap ok")).json()["ok"] is True
    assert un_owner.post(API, json=prop_payload(f"{PREFIX} cap two")).status_code == 400


def test_updates_are_allowed_at_the_cap(un_owner, monkeypatch):
    pid = un_owner.post(API, json=prop_payload(f"{PREFIX} at cap {tag()}")).json()["id"]
    total = un_owner.get(API).json()["all"]
    monkeypatch.setitem(PLAN_DEFS["STARTER"], "maxListings", total)
    assert un_owner.put(f"{API}/{pid}", json=prop_payload(f"{PREFIX} at cap renamed {tag()}")).json()["ok"] is True


# ---------------------------------------------------------------- delete side effects

def test_delete_keeps_leads_and_removes_tours(owner):
    pid = create(owner)
    with tenant_db() as db:
        lead = Lead(propertyId=pid, name=f"{PREFIX} lead", email="zz@example.com", source="ENQUIRY", status="NEW")
        tour = Tour(propertyId=pid, title="tour of test", kind="EXTERNAL", externalUrl="https://example.com")
        db.add_all([lead, tour])
        db.commit()
        lead_id, tour_id = lead.id, tour.id

    row = next(r for r in owner.get(API, params={"q": PREFIX}).json()["rows"] if r["id"] == pid)
    assert row["_count"] == {"leads": 1, "tours": 1}
    assert owner.get(f"{API}/{pid}").json()["tours"] == [{"id": tour_id, "title": "tour of test", "published": False}]

    assert owner.delete(f"{API}/{pid}").json() == {"ok": True}
    with tenant_db() as db:
        kept = db.get(Lead, lead_id)
        assert kept is not None and kept.propertyId is None
        assert db.get(Tour, tour_id) is None
        db.delete(kept)
        db.commit()
