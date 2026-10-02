"""Admin virtual tours: tours, scenes and hotspots (360° editor). Plan feature `tours`.

Every endpoint requires a signed-in OWNER/ADMIN (SUPER always passes) on a plan that includes `tours`
(anonymous -> 401, broker -> 403, locked plan -> 403 {error, code:"plan_locked", feature:"tours"}).
Failures are 400 {"error": "<message>"}. All successful mutations return {"ok": true, ...fields}.
Dates are ISO-8601 strings; keys equal the Prisma field names.

READS
GET    /api/admin/tours?property=<propertyId>
         -> {tours: [Tour + {property:{title,locality,city}, scenes:[{panoramaUrl,thumbUrl}] (first scene by order, 0..1 items),
                              _count:{scenes:int}}] ordered by updatedAt desc,
             properties: [{id,title}] ordered by title (for the "new tour" dialog),
             defaultPropertyId: <propertyId from ?property= if it is a real property of this tenant, else null>}
GET    /api/admin/tours/{tourId}                                   (404 {"error"} when missing)
         -> {tour: {...Tour columns, plan: {width,height,label}|null},     (plan == Tour.planFloors when it is an object)
             initialScenes: [Scene + {hotspots:[Hotspot]}] ordered by `order`,
             property: {id,title,lat,lng}}
         These three values are exactly the props the page passed to <TourEditor tour initialScenes property>; the editor
         only reads tour.{id,title,kind,externalUrl,published,autoRotate,startSceneId,floorPlanUrl,plan}.

TOURS
POST   /api/admin/tours                         body {propertyId, title?, kind?: "PANORAMA"|"EXTERNAL"}   -> {ok, id}
         "Choose a property for this tour" if the property is not found. Blank title -> "<property title> · 360° tour".
PUT    /api/admin/tours/{tourId}                body {title, kind, externalUrl?, published, autoRotate, startSceneId?,
                                                      floorPlanUrl?, planWidth?, planHeight?, planLabel?}   -> {ok}
         (saveTourSettings; full object, not a patch). Rules: title 2..120; EXTERNAL needs an https:// externalUrl (ignored/cleared
         for PANORAMA); publishing a PANORAMA tour needs >=1 scene; startSceneId must belong to the tour; with floorPlanUrl the plan
         is stored as {width: planWidth||800, height: planHeight||520, label: planLabel||"Floor plan"}, without it planFloors=null.
DELETE /api/admin/tours/{tourId}                                                                       -> {ok}

SCENES
POST   /api/admin/tours/{tourId}/scenes         body {items:[{panoramaUrl, thumbUrl?, name?}]} (1..20; a bare array is accepted too)
                                                                                                       -> {ok, scenes:[Scene + {hotspots:[]}]}
         New scenes are appended after the last `order`, inherit the property's lat/lng, and the first one becomes the tour's
         startSceneId when the tour has none.
PUT    /api/admin/tours/{tourId}/scenes/order   body {ids:[sceneId,...]} (a bare array is accepted too)  -> {ok}
         ids[i] gets order=i; every id must be a scene of the tour ("Invalid scene order").
PATCH  /api/admin/scenes/{sceneId}              body partial {name, roomLabel, floor, planX, planY, lat, lng, northYaw, initialYaw}
                                                                                                       -> {ok}
         name 1..80 (trimmed), roomLabel <=80 (""/null clears), floor int -5..200, planX/planY 0..1 or null, lat -90..90 or null,
         lng -180..180 or null, northYaw/initialYaw -360..360. Unknown keys are ignored.
DELETE /api/admin/scenes/{sceneId}                                                                     -> {ok, startSceneId, published}
         Re-picks the start scene when the deleted one was the start; a PANORAMA tour left without scenes is unpublished.
         Hotspots in other scenes that pointed at it keep existing with targetSceneId=null (database SET NULL, as before).

HOTSPOTS
POST   /api/admin/scenes/{sceneId}/hotspots               body {type:"LINK"|"INFO", yaw:-360..360, pitch:-90..90, label?<=60,
                                                                 content?<=500, targetSceneId?}      -> {ok, hotspot}
PUT    /api/admin/scenes/{sceneId}/hotspots/{hotspotId}   same body, updates an existing hotspot of that scene -> {ok, hotspot}
         LINK needs targetSceneId of another scene in the same tour; INFO drops targetSceneId and needs label or content.
DELETE /api/admin/hotspots/{hotspotId}                                                                 -> {ok}
"""

import re
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, select

from app.deps import STAFF, AdminCtx, authed
from app.errors import NotFound, UserError
from app.models import Hotspot, Property, Scene, Tour
from app.serialize import ser
from app.validate import blank, choice, opt_number, opt_text, require_dict, req_text

router = APIRouter(prefix="/api/admin")

tours_ctx = authed(STAFF, "tours")

MAX_SCENES_PER_BATCH = 20


def _own_tour(ctx: AdminCtx, tour_id: str) -> Tour:
    tour = ctx.db.scalars(select(Tour).where(Tour.id == tour_id)).first()
    if not tour:
        raise UserError("Tour not found")
    return tour


def _own_scene(ctx: AdminCtx, scene_id: str) -> Scene:
    scene = ctx.db.scalars(select(Scene).where(Scene.id == scene_id)).first()
    if not scene:
        raise UserError("Scene not found")
    return scene


def _scenes_of(ctx: AdminCtx, tour_id: str) -> list[Scene]:
    return list(ctx.db.scalars(select(Scene).where(Scene.tourId == tour_id).order_by(Scene.order.asc(), Scene.id.asc())))


def _hotspots_by_scene(ctx: AdminCtx, scene_ids: list[str]) -> dict[str, list[Hotspot]]:
    grouped: dict[str, list[Hotspot]] = {sid: [] for sid in scene_ids}
    if scene_ids:
        for h in ctx.db.scalars(select(Hotspot).where(Hotspot.sceneId.in_(scene_ids)).order_by(Hotspot.id.asc())):
            grouped[h.sceneId].append(h)
    return grouped


def _scene_json(scene: Scene, hotspots: list[Hotspot]) -> dict:
    return ser(scene, hotspots=[ser(h) for h in hotspots])


def _strict_number(v: Any, label: str, lo: float, hi: float, integer: bool = False) -> float | int:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise UserError(f"{label} must be a number")
    if integer and v != int(v):
        raise UserError(f"{label} must be a whole number")
    if v < lo:
        raise UserError(f"{label} must be at least {lo:g}")
    if v > hi:
        raise UserError(f"{label} must be at most {hi:g}")
    return int(v) if integer else v


def _clean_num(n: float | int) -> float | int:
    return int(n) if isinstance(n, float) and n.is_integer() else n


def _is_url(raw: str) -> tuple[bool, bool]:
    """(parses like WHATWG `new URL`, uses https)."""
    if re.search(r"\s", raw):
        return False, False
    try:
        parsed = urlparse(raw)
    except ValueError:
        return False, False
    if not parsed.scheme:
        return False, False
    if parsed.scheme in ("http", "https") and not parsed.hostname:
        return False, False
    return True, parsed.scheme == "https"


@router.get("/tours")
def list_tours(property: str | None = Query(default=None), ctx: AdminCtx = Depends(tours_ctx)):
    db = ctx.db
    tours = list(db.scalars(select(Tour).order_by(Tour.updatedAt.desc(), Tour.id.asc())))
    properties = list(db.execute(select(Property.id, Property.title).order_by(Property.title.asc(), Property.id.asc())))

    ids = [t.id for t in tours]
    counts: dict[str, int] = {}
    first: dict[str, Scene] = {}
    if ids:
        counts = dict(db.execute(select(Scene.tourId, func.count(Scene.id)).where(Scene.tourId.in_(ids)).group_by(Scene.tourId)).all())
        for s in db.scalars(select(Scene).where(Scene.tourId.in_(ids)).order_by(Scene.tourId, Scene.order.asc(), Scene.id.asc())):
            first.setdefault(s.tourId, s)
        props = {
            p.id: p
            for p in db.scalars(select(Property).where(Property.id.in_({t.propertyId for t in tours})))
        }
    else:
        props = {}

    rows = []
    for t in tours:
        p = props.get(t.propertyId)
        s = first.get(t.id)
        rows.append(
            ser(
                t,
                property={"title": p.title, "locality": p.locality, "city": p.city} if p else None,
                scenes=[{"panoramaUrl": s.panoramaUrl, "thumbUrl": s.thumbUrl}] if s else [],
                _count={"scenes": counts.get(t.id, 0)},
            )
        )
    valid_default = property if property and any(pid == property for pid, _ in properties) else None
    return {"tours": rows, "properties": [{"id": pid, "title": title} for pid, title in properties], "defaultPropertyId": valid_default}


@router.get("/tours/{tour_id}")
def get_tour(tour_id: str, ctx: AdminCtx = Depends(tours_ctx)):
    tour = ctx.db.scalars(select(Tour).where(Tour.id == tour_id)).first()
    if not tour:
        raise NotFound("Tour not found")
    prop = ctx.db.scalars(select(Property).where(Property.id == tour.propertyId)).first()
    scenes = _scenes_of(ctx, tour.id)
    hotspots = _hotspots_by_scene(ctx, [s.id for s in scenes])
    plan = tour.planFloors if isinstance(tour.planFloors, dict) else None
    return {
        "tour": ser(tour, plan=plan),
        "initialScenes": [_scene_json(s, hotspots[s.id]) for s in scenes],
        "property": {"id": prop.id, "title": prop.title, "lat": prop.lat, "lng": prop.lng} if prop else None,
    }


@router.post("/tours")
def create_tour(body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(tours_ctx)):
    property_id = body.get("propertyId")
    prop = ctx.db.scalars(select(Property).where(Property.id == property_id)).first() if isinstance(property_id, str) and property_id else None
    if not prop:
        raise UserError("Choose a property for this tour")
    title = str(body.get("title") or "").strip()[:120] or f"{prop.title} · 360° tour"
    tour = Tour(propertyId=prop.id, title=title, kind="EXTERNAL" if body.get("kind") == "EXTERNAL" else "PANORAMA", published=False)
    ctx.db.add(tour)
    ctx.db.commit()
    return {"ok": True, "id": tour.id}


@router.put("/tours/{tour_id}")
def save_tour_settings(tour_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(tours_ctx)):
    tour = _own_tour(ctx, tour_id)
    body = require_dict(body, "Settings")

    title = req_text(body.get("title"), "Title", min_len=2, max_len=120, message="Give the tour a title")
    kind = choice(body.get("kind"), ("PANORAMA", "EXTERNAL"), "Tour type")
    external_url = opt_text(body.get("externalUrl"), 500, "External link")
    published = body.get("published")
    auto_rotate = body.get("autoRotate")
    if not isinstance(published, bool):
        raise UserError("Published must be true or false")
    if not isinstance(auto_rotate, bool):
        raise UserError("Auto-rotate must be true or false")
    start_scene_id = opt_text(body.get("startSceneId"), 40, "Start scene")
    floor_plan_url = opt_text(body.get("floorPlanUrl"), 600, "Floor plan link")
    plan_width = opt_number(body.get("planWidth"), "Plan width", 10, 20000)
    plan_height = opt_number(body.get("planHeight"), "Plan height", 10, 20000)
    plan_label = opt_text(body.get("planLabel"), 60, "Plan label")

    if kind == "EXTERNAL":
        if not external_url:
            raise UserError("Paste the external tour link (Matterport, Kuula, YouTube 360…)")
        valid, secure = _is_url(external_url)
        if not valid:
            raise UserError("That link does not look right")
        if not secure:
            raise UserError("External tours must use https://")
    if published and kind == "PANORAMA":
        count = ctx.db.scalar(select(func.count(Scene.id)).where(Scene.tourId == tour.id))
        if not count:
            raise UserError("Add at least one scene before publishing")
    if start_scene_id:
        found = ctx.db.scalars(select(Scene.id).where(Scene.id == start_scene_id, Scene.tourId == tour.id)).first()
        if not found:
            raise UserError("Start scene not found")

    tour.title = title
    tour.kind = kind
    tour.externalUrl = external_url if kind == "EXTERNAL" else None
    tour.published = published
    tour.autoRotate = auto_rotate
    tour.startSceneId = start_scene_id
    tour.floorPlanUrl = floor_plan_url
    tour.planFloors = (
        {"width": _clean_num(plan_width or 800), "height": _clean_num(plan_height or 520), "label": plan_label or "Floor plan"}
        if floor_plan_url
        else None
    )
    ctx.db.commit()
    return {"ok": True}


@router.delete("/tours/{tour_id}")
def delete_tour(tour_id: str, ctx: AdminCtx = Depends(tours_ctx)):
    tour = _own_tour(ctx, tour_id)
    ctx.db.delete(tour)
    ctx.db.commit()
    return {"ok": True}


@router.post("/tours/{tour_id}/scenes")
def add_scenes(tour_id: str, body: Any = Body(default=None), ctx: AdminCtx = Depends(tours_ctx)):
    tour = _own_tour(ctx, tour_id)
    items = body.get("items") if isinstance(body, dict) else body
    if not isinstance(items, list) or not items or len(items) > MAX_SCENES_PER_BATCH:
        raise UserError("Add between 1 and 20 panoramas")

    prop = ctx.db.scalars(select(Property).where(Property.id == tour.propertyId)).first()
    last = ctx.db.scalar(select(func.max(Scene.order)).where(Scene.tourId == tour.id))
    order = (last if last is not None else -1) + 1

    created: list[Scene] = []
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("panoramaUrl"), str) or not it["panoramaUrl"]:
            continue
        scene = Scene(
            tourId=tour.id,
            name=str(it.get("name") or f"Scene {order + 1}")[:80],
            panoramaUrl=it["panoramaUrl"],
            thumbUrl=it["thumbUrl"] if isinstance(it.get("thumbUrl"), str) else None,
            order=order,
            lat=prop.lat if prop else None,
            lng=prop.lng if prop else None,
        )
        order += 1
        ctx.db.add(scene)
        created.append(scene)
    ctx.db.flush()
    if not tour.startSceneId and created:
        tour.startSceneId = created[0].id
    ctx.db.commit()
    return {"ok": True, "scenes": [_scene_json(s, []) for s in created]}


@router.put("/tours/{tour_id}/scenes/order")
def reorder_scenes(tour_id: str, body: Any = Body(default=None), ctx: AdminCtx = Depends(tours_ctx)):
    _own_tour(ctx, tour_id)
    ids = body.get("ids") if isinstance(body, dict) else body
    scenes = {s.id: s for s in _scenes_of(ctx, tour_id)}
    if not isinstance(ids, list) or any(not isinstance(i, str) or i not in scenes for i in ids):
        raise UserError("Invalid scene order")
    for order, sid in enumerate(ids):
        scenes[sid].order = order
    ctx.db.commit()
    return {"ok": True}


def _scene_patch(body: Any) -> dict:
    body = require_dict(body, "Scene")
    out: dict[str, Any] = {}
    if "name" in body:
        out["name"] = req_text(body["name"], "Scene name", min_len=1, max_len=80)
    if "roomLabel" in body:
        out["roomLabel"] = opt_text(body["roomLabel"], 80, "Room label")
    if "floor" in body:
        out["floor"] = _strict_number(body["floor"], "Floor", -5, 200, integer=True)
    if "planX" in body:
        out["planX"] = opt_number(body["planX"], "Plan position", 0, 1)
    if "planY" in body:
        out["planY"] = opt_number(body["planY"], "Plan position", 0, 1)
    if "lat" in body:
        out["lat"] = opt_number(body["lat"], "Latitude", -90, 90)
    if "lng" in body:
        out["lng"] = opt_number(body["lng"], "Longitude", -180, 180)
    if "northYaw" in body:
        out["northYaw"] = _strict_number(body["northYaw"], "North direction", -360, 360)
    if "initialYaw" in body:
        out["initialYaw"] = _strict_number(body["initialYaw"], "Opening angle", -360, 360)
    return out


@router.patch("/scenes/{scene_id}")
def update_scene(scene_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(tours_ctx)):
    scene = _own_scene(ctx, scene_id)
    for key, value in _scene_patch(body).items():
        setattr(scene, key, value)
    ctx.db.commit()
    return {"ok": True}


@router.delete("/scenes/{scene_id}")
def delete_scene(scene_id: str, ctx: AdminCtx = Depends(tours_ctx)):
    db = ctx.db
    scene = _own_scene(ctx, scene_id)
    tour_id = scene.tourId
    db.delete(scene)
    db.flush()

    tour = db.scalars(select(Tour).where(Tour.id == tour_id)).first()
    start_scene_id = tour.startSceneId if tour else None
    published = tour.published if tour else False
    if tour and tour.startSceneId == scene_id:
        nxt = db.scalars(select(Scene.id).where(Scene.tourId == tour_id).order_by(Scene.order.asc(), Scene.id.asc()).limit(1)).first()
        start_scene_id = nxt
        if not nxt and tour.kind == "PANORAMA":
            published = False
        tour.startSceneId = start_scene_id
        tour.published = published
    db.commit()
    return {"ok": True, "startSceneId": start_scene_id, "published": published}


def _hotspot_input(body: Any) -> dict:
    body = require_dict(body, "Hotspot")
    return {
        "type": choice(body.get("type"), ("LINK", "INFO"), "Hotspot type"),
        "yaw": _strict_number(body.get("yaw"), "Yaw", -360, 360),
        "pitch": _strict_number(body.get("pitch"), "Pitch", -90, 90),
        "label": opt_text(body.get("label"), 60, "Label"),
        "content": opt_text(body.get("content"), 500, "Details"),
        "targetSceneId": opt_text(body.get("targetSceneId"), 40, "Target scene"),
    }


def _save_hotspot(ctx: AdminCtx, scene_id: str, hotspot_id: str | None, body: Any) -> dict:
    db = ctx.db
    scene = _own_scene(ctx, scene_id)
    d = _hotspot_input(body)
    if d["type"] == "LINK":
        if not d["targetSceneId"]:
            raise UserError("Choose which room this arrow leads to")
        if d["targetSceneId"] == scene_id:
            raise UserError("A hotspot cannot link to its own scene")
        target = db.scalars(select(Scene.id).where(Scene.id == d["targetSceneId"], Scene.tourId == scene.tourId)).first()
        if not target:
            raise UserError("Target scene not found")
    else:
        d["targetSceneId"] = None
        if blank(d["content"]) and blank(d["label"]):
            raise UserError("Write something for the info point")

    if hotspot_id:
        hotspot = db.scalars(select(Hotspot).where(Hotspot.id == hotspot_id, Hotspot.sceneId == scene_id)).first()
        if not hotspot:
            raise UserError("Hotspot not found")
        for key, value in d.items():
            setattr(hotspot, key, value)
    else:
        hotspot = Hotspot(sceneId=scene_id, **d)
        db.add(hotspot)
    db.commit()
    return {"ok": True, "hotspot": ser(hotspot)}


@router.post("/scenes/{scene_id}/hotspots")
def create_hotspot(scene_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(tours_ctx)):
    return _save_hotspot(ctx, scene_id, None, body)


@router.put("/scenes/{scene_id}/hotspots/{hotspot_id}")
def update_hotspot(scene_id: str, hotspot_id: str, body: dict = Body(default_factory=dict), ctx: AdminCtx = Depends(tours_ctx)):
    return _save_hotspot(ctx, scene_id, hotspot_id, body)


@router.delete("/hotspots/{hotspot_id}")
def delete_hotspot(hotspot_id: str, ctx: AdminCtx = Depends(tours_ctx)):
    hotspot = ctx.db.scalars(select(Hotspot).where(Hotspot.id == hotspot_id)).first()
    if not hotspot:
        raise UserError("Hotspot not found")
    ctx.db.delete(hotspot)
    ctx.db.commit()
    return {"ok": True}
