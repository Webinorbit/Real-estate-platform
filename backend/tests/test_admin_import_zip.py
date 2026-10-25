import io
import json
import zipfile

import pytest
from PIL import Image
from sqlalchemy import delete, select

from app.models import Broker, Hotspot, Property, Scene, Tour, User
from tests.team_helpers import login, tenant_db, uid

TENANT = "urbannest"


def png(w: int = 64, h: int = 48) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (15, 61, 62)).save(buf, "PNG")
    return buf.getvalue()


def make_zip(tag: str, plan: str | None = None, nested: bool = True) -> bytes:
    root = "setup/" if nested else ""
    settings = {"tagline": f"Zip tagline {tag}", "mapZoom": 5}
    if plan:
        settings["plan"] = plan
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"{root}settings.json", json.dumps(settings))
        z.writestr(
            f"{root}team.csv",
            "Full name,Email (their login),Languages spoken,Photo file\n"
            f"Zip Agent {tag},zip-{tag}@example.com,English; Hindi,agent-{tag}.png\n"
            f",broken-{tag},English,\n",
        )
        z.writestr(f"{root}team-photos/agent-{tag}.png", png())
        z.writestr(
            f"{root}properties.csv",
            "title,listing type,property type,price,bedrooms,locality,city,latitude,longitude,featured,agent email\n"
            f"Zip Home {tag},sale,apartment,5000000,2,Powai,Mumbai,19.11,72.90,yes,zip-{tag}@example.com\n"
            f"Zip Broken {tag},sale,apartment,,2,Powai,Mumbai,19.11,72.90,no,\n",
        )
        z.writestr(f"{root}photos/01 - Zip Home {tag}/1.png", png())
        z.writestr(f"{root}photos/01 - Zip Home {tag}/2.png", png())
        z.writestr(f"{root}tours/01 - Zip Home {tag}/1 - Living room.png", png(400, 200))
        z.writestr(f"{root}tours/01 - Zip Home {tag}/2 - Master_bedroom.png", png(400, 200))
        z.writestr(f"{root}__MACOSX/._junk", b"junk")
    return buf.getvalue()


@pytest.fixture
def cleanup():
    tags: list[str] = []
    with tenant_db(TENANT) as (_, tenant):
        original = (tenant.plan, tenant.tagline, tenant.mapZoom)
    yield tags
    with tenant_db(TENANT) as (db, tenant):
        for tag in tags:
            db.execute(delete(Property).where(Property.title.like(f"Zip % {tag}")))
            db.execute(delete(Broker).where(Broker.email == f"zip-{tag}@example.com"))
            db.execute(delete(User).where(User.tenantId == tenant.id, User.email == f"zip-{tag}@example.com"))
        tenant.plan, tenant.tagline, tenant.mapZoom = original
        db.commit()


def upload(client, data: bytes):
    return client.post("/api/admin/import/zip", files={"file": ("setup.zip", data, "application/zip")})


def test_starter_owner_is_plan_locked_and_cannot_upgrade(cleanup):
    tag = uid()
    cleanup.append(tag)
    res = upload(login("owner@urbannest.demo", TENANT), make_zip(tag, plan="ENTERPRISE"))
    assert res.status_code == 403 and res.json()["code"] == "plan_locked"
    with tenant_db(TENANT) as (_, tenant):
        assert tenant.plan == "STARTER"


def test_super_admin_zip_sets_plan_settings_team_and_listings(cleanup):
    tag = uid()
    cleanup.append(tag)
    res = upload(login("super@webinorbit.demo", TENANT), make_zip(tag, plan="PRO"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"] == {"changed": True, "plan": "PRO"}
    assert body["settings"]["updated"] is True
    assert body["team"]["created"] == 1 and len(body["team"]["skipped"]) == 1
    assert body["team"]["logins"][0]["email"] == f"zip-{tag}@example.com"
    assert body["properties"]["created"] == 1 and body["properties"]["photos"] == 2
    assert body["properties"]["failed"][0]["row"] == 2

    with tenant_db(TENANT) as (db, tenant):
        assert tenant.tagline == f"Zip tagline {tag}" and tenant.mapZoom == 5
        broker = db.scalars(select(Broker).where(Broker.email == f"zip-{tag}@example.com")).one()
        assert broker.photoUrl and broker.languages == ["English", "Hindi"]
        prop = db.scalars(select(Property).where(Property.title == f"Zip Home {tag}")).one()
        assert prop.featured and prop.listingBrokerId == broker.id and len(prop.images) == 2
        tour = db.scalars(select(Tour).where(Tour.propertyId == prop.id)).one()
        scenes = db.scalars(select(Scene).where(Scene.tourId == tour.id).order_by(Scene.order)).all()
        assert tour.published and tour.startSceneId == scenes[0].id
        assert [s.name for s in scenes] == ["Living room", "Master bedroom"]
        links = db.scalars(select(Hotspot).where(Hotspot.sceneId == scenes[0].id)).all()
        assert [h.targetSceneId for h in links] == [scenes[1].id]
    assert body["properties"]["tours"] == 1 and body["properties"]["scenes"] == 2


def test_owner_on_pro_plan_ignores_plan_key(cleanup):
    tag = uid()
    cleanup.append(tag)
    with tenant_db(TENANT) as (db, tenant):
        tenant.plan = "PRO"
        db.commit()
    res = upload(login("owner@urbannest.demo", TENANT), make_zip(tag, plan="ENTERPRISE", nested=False))
    assert res.status_code == 200, res.text
    assert res.json()["plan"] == {"changed": False, "plan": "PRO"}
    assert any("only WebInOrbit" in w for w in res.json()["warnings"])


def test_rejects_bad_and_empty_zips():
    client = login("super@webinorbit.demo", TENANT)
    assert upload(client, b"not a zip").json()["error"] == "That file is not a valid .zip"
    empty = io.BytesIO()
    with zipfile.ZipFile(empty, "w") as z:
        z.writestr("notes.txt", "hello")
    assert "Nothing to import" in upload(client, empty.getvalue()).json()["error"]


def test_template_downloads():
    res = login("owner@urbannest.demo", TENANT).get("/api/admin/import/zip-template")
    assert res.status_code == 200 and res.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(res.content)).namelist()
    assert {"setup/settings.json", "setup/team.csv", "setup/properties.csv"} <= set(names)
