import secrets

import pytest
from fastapi.testclient import TestClient

from app.main import app

HERITAGE = {"x-tenant-host": "heritage.localhost"}
URBAN = {"x-tenant-host": "urbannest.localhost"}
PWD = "demo1234"


def login(email: str, headers: dict | None = None) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": email, "password": PWD}, headers=headers or {})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(scope="module")
def owner():
    return login("owner@skyline.demo")


@pytest.fixture
def tour(owner):
    props = owner.get("/api/admin/tours").json()["properties"]
    assert props
    r = owner.post("/api/admin/tours", json={"propertyId": props[0]["id"], "title": f"pytest-{secrets.token_hex(4)}"})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    yield tid
    owner.delete(f"/api/admin/tours/{tid}")


def add(owner, tid, n=2):
    items = [{"panoramaUrl": f"/uploads/x/pytest-{i}.jpg", "thumbUrl": f"/uploads/x/t{i}.jpg", "name": f"Room {i}"} for i in range(n)]
    r = owner.post(f"/api/admin/tours/{tid}/scenes", json={"items": items})
    assert r.status_code == 200, r.text
    return r.json()["scenes"]


def settings(**over):
    base = {"title": "pytest tour", "kind": "PANORAMA", "externalUrl": "", "published": False, "autoRotate": True, "startSceneId": None,
            "floorPlanUrl": "", "planWidth": 800, "planHeight": 520, "planLabel": ""}
    base.update(over)
    return base


def test_authorization(owner, tour):
    anon = TestClient(app)
    assert anon.get("/api/admin/tours").status_code == 401
    assert anon.post("/api/admin/tours", json={}).status_code == 401
    assert anon.delete(f"/api/admin/tours/{tour}").status_code == 401

    broker = login("priya@skyline.demo")
    assert broker.get("/api/admin/tours").status_code == 403
    assert broker.delete(f"/api/admin/tours/{tour}").status_code == 403
    assert broker.patch("/api/admin/scenes/x", json={}).status_code == 403
    assert broker.delete("/api/admin/hotspots/x").status_code == 403

    urban = login("owner@urbannest.demo", URBAN)
    for r in (urban.get("/api/admin/tours", headers=URBAN), urban.post("/api/admin/tours", json={}, headers=URBAN)):
        assert r.status_code == 403
        assert r.json()["code"] == "plan_locked" and r.json()["feature"] == "tours"

    assert owner.get(f"/api/admin/tours/{tour}").status_code == 200


def test_cross_tenant_isolation(owner, tour):
    scenes = add(owner, tour, 2)
    other = login("owner@heritage.demo", HERITAGE)
    assert other.get(f"/api/admin/tours/{tour}", headers=HERITAGE).status_code == 404
    assert other.get("/api/admin/tours", headers=HERITAGE).json()["tours"] is not None
    assert tour not in [t["id"] for t in other.get("/api/admin/tours", headers=HERITAGE).json()["tours"]]
    assert other.put(f"/api/admin/tours/{tour}", json=settings(), headers=HERITAGE).json()["error"] == "Tour not found"
    assert other.delete(f"/api/admin/tours/{tour}", headers=HERITAGE).json()["error"] == "Tour not found"
    assert other.patch(f"/api/admin/scenes/{scenes[0]['id']}", json={"name": "x"}, headers=HERITAGE).json()["error"] == "Scene not found"
    assert other.delete(f"/api/admin/scenes/{scenes[0]['id']}", headers=HERITAGE).json()["error"] == "Scene not found"
    heritage_props = other.get("/api/admin/tours", headers=HERITAGE).json()["properties"]
    r = other.post(f"/api/admin/tours/{tour}/scenes", json={"items": [{"panoramaUrl": "/a.jpg"}]}, headers=HERITAGE)
    assert r.json()["error"] == "Tour not found"
    skyline_prop = owner.get("/api/admin/tours").json()["properties"][0]["id"]
    assert skyline_prop not in [p["id"] for p in heritage_props]
    r = other.post("/api/admin/tours", json={"propertyId": skyline_prop}, headers=HERITAGE)
    assert r.status_code == 400 and r.json()["error"] == "Choose a property for this tour"


def test_list_and_create(owner):
    data = owner.get("/api/admin/tours").json()
    assert set(data) == {"tours", "properties", "defaultPropertyId"}
    assert data["defaultPropertyId"] is None
    pid = data["properties"][0]["id"]
    assert owner.get(f"/api/admin/tours?property={pid}").json()["defaultPropertyId"] == pid
    assert owner.get("/api/admin/tours?property=nope").json()["defaultPropertyId"] is None

    r = owner.post("/api/admin/tours", json={"propertyId": pid, "title": "", "kind": "EXTERNAL"})
    tid = r.json()["id"]
    try:
        detail = owner.get(f"/api/admin/tours/{tid}").json()
        assert detail["tour"]["kind"] == "EXTERNAL" and detail["tour"]["published"] is False
        assert detail["tour"]["title"].endswith(" · 360° tour")
        assert detail["tour"]["plan"] is None
        assert detail["property"]["id"] == pid and detail["initialScenes"] == []
        row = next(t for t in owner.get("/api/admin/tours").json()["tours"] if t["id"] == tid)
        assert row["_count"] == {"scenes": 0} and row["scenes"] == [] and set(row["property"]) == {"title", "locality", "city"}
    finally:
        owner.delete(f"/api/admin/tours/{tid}")

    assert owner.post("/api/admin/tours", json={"title": "x"}).json()["error"] == "Choose a property for this tour"
    assert owner.get("/api/admin/tours/does-not-exist").status_code == 404


def test_scene_lifecycle_and_publish_rules(owner, tour):
    s = settings(published=True)
    assert owner.put(f"/api/admin/tours/{tour}", json=s).json()["error"] == "Add at least one scene before publishing"

    scenes = add(owner, tour, 3)
    a, b, c = (x["id"] for x in scenes)
    assert [x["order"] for x in scenes] == [0, 1, 2] and all(x["hotspots"] == [] for x in scenes)
    detail = owner.get(f"/api/admin/tours/{tour}").json()
    assert detail["tour"]["startSceneId"] == a
    assert scenes[0]["lat"] == detail["property"]["lat"]

    more = owner.post(f"/api/admin/tours/{tour}/scenes", json=[{"panoramaUrl": "/z.jpg"}, {"panoramaUrl": ""}, {"nope": 1}]).json()["scenes"]
    assert len(more) == 1 and more[0]["order"] == 3 and more[0]["name"] == "Scene 4"
    assert owner.get(f"/api/admin/tours/{tour}").json()["tour"]["startSceneId"] == a
    d = more[0]["id"]

    assert owner.post(f"/api/admin/tours/{tour}/scenes", json={"items": []}).json()["error"] == "Add between 1 and 20 panoramas"
    too_many = [{"panoramaUrl": "/a.jpg"}] * 21
    assert owner.post(f"/api/admin/tours/{tour}/scenes", json={"items": too_many}).json()["error"] == "Add between 1 and 20 panoramas"

    assert owner.put(f"/api/admin/tours/{tour}", json=settings(published=True, title="pytest pub", startSceneId="nope")).json()["error"] == "Start scene not found"
    r = owner.put(f"/api/admin/tours/{tour}", json=settings(published=True, title="pytest pub", startSceneId=b, floorPlanUrl="/uploads/plan.png", planWidth=1000, planHeight="640", planLabel=" Ground "))
    assert r.status_code == 200, r.text
    t = owner.get(f"/api/admin/tours/{tour}").json()["tour"]
    assert t["published"] is True and t["startSceneId"] == b and t["title"] == "pytest pub"
    assert t["plan"] == {"width": 1000, "height": 640, "label": "Ground"} and t["floorPlanUrl"] == "/uploads/plan.png"
    owner.put(f"/api/admin/tours/{tour}", json=settings(published=True, startSceneId=b, floorPlanUrl="/p.png"))
    assert owner.get(f"/api/admin/tours/{tour}").json()["tour"]["plan"] == {"width": 800, "height": 520, "label": "Floor plan"}
    owner.put(f"/api/admin/tours/{tour}", json=settings(published=True, startSceneId=b))
    assert owner.get(f"/api/admin/tours/{tour}").json()["tour"]["plan"] is None

    assert owner.put(f"/api/admin/tours/{tour}/scenes/order", json={"ids": [d, c, b, a]}).status_code == 200
    assert [x["id"] for x in owner.get(f"/api/admin/tours/{tour}").json()["initialScenes"]] == [d, c, b, a]
    assert owner.put(f"/api/admin/tours/{tour}/scenes/order", json=[a, "bogus"]).json()["error"] == "Invalid scene order"
    assert owner.put(f"/api/admin/tours/{tour}/scenes/order", json={"ids": "x"}).json()["error"] == "Invalid scene order"

    res = owner.delete(f"/api/admin/scenes/{b}").json()
    assert res == {"ok": True, "startSceneId": d, "published": True}
    res = owner.delete(f"/api/admin/scenes/{a}").json()
    assert res["startSceneId"] == d
    owner.delete(f"/api/admin/scenes/{c}")
    res = owner.delete(f"/api/admin/scenes/{d}").json()
    assert res == {"ok": True, "startSceneId": None, "published": False}
    detail = owner.get(f"/api/admin/tours/{tour}").json()
    assert detail["initialScenes"] == [] and detail["tour"]["published"] is False


def test_settings_validation(owner, tour):
    put = lambda **o: owner.put(f"/api/admin/tours/{tour}", json=settings(**o))
    assert put(title=" a ").json()["error"] == "Give the tour a title"
    assert put(title="x" * 121).status_code == 400
    assert put(kind="WEIRD").status_code == 400
    assert put(published="yes").status_code == 400
    assert put(kind="EXTERNAL").json()["error"] == "Paste the external tour link (Matterport, Kuula, YouTube 360…)"
    assert put(kind="EXTERNAL", externalUrl="not a url").json()["error"] == "That link does not look right"
    assert put(kind="EXTERNAL", externalUrl="https://").json()["error"] == "That link does not look right"
    assert put(kind="EXTERNAL", externalUrl="http://my.matterport.com/x").json()["error"] == "External tours must use https://"
    assert put(planWidth=5, floorPlanUrl="/p.png").status_code == 400
    assert put(kind="EXTERNAL", externalUrl="https://my.matterport.com/show/?m=abc", published=True).status_code == 200
    t = owner.get(f"/api/admin/tours/{tour}").json()["tour"]
    assert t["kind"] == "EXTERNAL" and t["externalUrl"] == "https://my.matterport.com/show/?m=abc" and t["published"] is True
    assert put(externalUrl="https://ignored.example/x").status_code == 200
    assert owner.get(f"/api/admin/tours/{tour}").json()["tour"]["externalUrl"] is None


def test_update_scene(owner, tour):
    sid = add(owner, tour, 1)[0]["id"]
    patch = lambda **o: owner.patch(f"/api/admin/scenes/{sid}", json=o)
    r = patch(name=" Lounge ", roomLabel="Living", floor=2, planX=0.25, planY=1, lat=19.1, lng=72.8, northYaw=-45.5, initialYaw=90)
    assert r.status_code == 200, r.text
    sc = owner.get(f"/api/admin/tours/{tour}").json()["initialScenes"][0]
    assert (sc["name"], sc["roomLabel"], sc["floor"], sc["planX"], sc["planY"], sc["northYaw"], sc["initialYaw"]) == ("Lounge", "Living", 2, 0.25, 1, -45.5, 90)

    assert patch(roomLabel="", planX=None, lat="").status_code == 200
    sc = owner.get(f"/api/admin/tours/{tour}").json()["initialScenes"][0]
    assert sc["roomLabel"] is None and sc["planX"] is None and sc["lat"] is None and sc["name"] == "Lounge" and sc["floor"] == 2

    assert patch().status_code == 200
    assert patch(name="  ").status_code == 400
    assert patch(name="x" * 81).status_code == 400
    assert patch(floor=1.5).status_code == 400
    assert patch(floor=201).status_code == 400
    assert patch(floor="2").status_code == 400
    assert patch(planX=1.2).status_code == 400
    assert patch(lat=91).status_code == 400
    assert patch(lng=-181).status_code == 400
    assert patch(northYaw=361).status_code == 400
    assert patch(initialYaw="a").status_code == 400
    assert owner.patch("/api/admin/scenes/missing", json={"name": "x"}).json()["error"] == "Scene not found"


def test_hotspots(owner, tour):
    scenes = add(owner, tour, 2)
    a, b = scenes[0]["id"], scenes[1]["id"]
    post = lambda sid, **o: owner.post(f"/api/admin/scenes/{sid}/hotspots", json=o)
    link = {"type": "LINK", "yaw": 12.5, "pitch": -3, "label": "", "content": "", "targetSceneId": b}

    r = post(a, **link)
    assert r.status_code == 200, r.text
    h = r.json()["hotspot"]
    assert h["sceneId"] == a and h["targetSceneId"] == b and h["label"] is None and h["yaw"] == 12.5

    assert post(a, **{**link, "targetSceneId": ""}).json()["error"] == "Choose which room this arrow leads to"
    assert post(a, **{**link, "targetSceneId": a}).json()["error"] == "A hotspot cannot link to its own scene"
    assert post(a, **{**link, "targetSceneId": "nope"}).json()["error"] == "Target scene not found"
    assert post(a, type="INFO", yaw=0, pitch=0, label="", content="").json()["error"] == "Write something for the info point"
    assert post(a, **{**link, "yaw": 400}).status_code == 400
    assert post(a, **{**link, "pitch": 91}).status_code == 400
    assert post(a, **{**link, "label": "x" * 61}).status_code == 400
    assert post(a, **{**link, "type": "BAD"}).status_code == 400
    assert post("missing", **link).json()["error"] == "Scene not found"

    other = login("owner@heritage.demo", HERITAGE)
    heritage_prop = other.get("/api/admin/tours", headers=HERITAGE).json()["properties"][0]["id"]
    ot = other.post("/api/admin/tours", json={"propertyId": heritage_prop, "title": "pytest-x"}, headers=HERITAGE).json()["id"]
    try:
        foreign = other.post(f"/api/admin/tours/{ot}/scenes", json={"items": [{"panoramaUrl": "/o.jpg"}]}, headers=HERITAGE).json()["scenes"][0]["id"]
        assert post(a, **{**link, "targetSceneId": foreign}).json()["error"] == "Target scene not found"
    finally:
        other.delete(f"/api/admin/tours/{ot}", headers=HERITAGE)

    t2 = owner.post("/api/admin/tours", json={"propertyId": owner.get(f"/api/admin/tours/{tour}").json()["property"]["id"], "title": "pytest-second"}).json()["id"]
    try:
        s2 = owner.post(f"/api/admin/tours/{t2}/scenes", json={"items": [{"panoramaUrl": "/o2.jpg"}]}).json()["scenes"][0]["id"]
        assert post(a, **{**link, "targetSceneId": s2}).json()["error"] == "Target scene not found"
    finally:
        owner.delete(f"/api/admin/tours/{t2}")

    r = owner.put(f"/api/admin/scenes/{a}/hotspots/{h['id']}", json={"type": "INFO", "yaw": 1, "pitch": 2, "label": "Marble", "content": "Italian", "targetSceneId": b})
    assert r.status_code == 200, r.text
    upd = r.json()["hotspot"]
    assert upd["id"] == h["id"] and upd["type"] == "INFO" and upd["targetSceneId"] is None and upd["content"] == "Italian"
    assert owner.put(f"/api/admin/scenes/{b}/hotspots/{h['id']}", json={**link, "targetSceneId": a}).json()["error"] == "Hotspot not found"

    listed = owner.get(f"/api/admin/tours/{tour}").json()["initialScenes"]
    assert [len(s["hotspots"]) for s in listed] == [1, 0]

    link_h = post(a, **link).json()["hotspot"]["id"]
    owner.delete(f"/api/admin/scenes/{b}")
    after = owner.get(f"/api/admin/tours/{tour}").json()["initialScenes"][0]["hotspots"]
    assert {x["id"]: x["targetSceneId"] for x in after}[link_h] is None

    assert owner.delete(f"/api/admin/hotspots/{h['id']}").json() == {"ok": True}
    assert owner.delete(f"/api/admin/hotspots/{h['id']}").json()["error"] == "Hotspot not found"
    assert owner.delete(f"/api/admin/hotspots/{link_h}").status_code == 200


def test_delete_tour_cascades(owner):
    pid = owner.get("/api/admin/tours").json()["properties"][0]["id"]
    tid = owner.post("/api/admin/tours", json={"propertyId": pid, "title": f"pytest-{secrets.token_hex(3)}"}).json()["id"]
    sid = owner.post(f"/api/admin/tours/{tid}/scenes", json={"items": [{"panoramaUrl": "/c.jpg"}]}).json()["scenes"][0]["id"]
    assert owner.delete(f"/api/admin/tours/{tid}").json() == {"ok": True}
    assert owner.get(f"/api/admin/tours/{tid}").status_code == 404
    assert owner.patch(f"/api/admin/scenes/{sid}", json={"name": "x"}).json()["error"] == "Scene not found"
    assert owner.delete(f"/api/admin/tours/{tid}").json()["error"] == "Tour not found"
