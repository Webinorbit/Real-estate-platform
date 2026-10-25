"""Property.roomLayout: validation of the agency floor plan and the admin / public round trip."""

import pytest

from app.errors import UserError
from app.room_layout import MAX_ROOMS, parse_room_layout
from tests.props_helpers import PREFIX, make_client, prop_payload, purge_test_properties, tag

API = "/api/admin/properties"


def room(rid="a", **over):
    return {"id": rid, "name": f"Room {rid}", "type": "bedroom", "x": 0, "z": 0, "w": 12, "d": 12, "floor": 0, **over}


def plan(*rooms):
    return {"rooms": list(rooms)}


def error(raw) -> str:
    with pytest.raises(UserError) as e:
        parse_room_layout(raw)
    return e.value.message


# ---------------------------------------------------------------- validation


def test_empty_means_generated():
    assert parse_room_layout(None) is None
    assert parse_room_layout("") is None
    assert parse_room_layout({"rooms": []}) is None


def test_normalises_rooms():
    out = parse_room_layout(plan(
        room("liv", name="  Living  ", type="living", w="20", d=14.333, entrance=True, extra="dropped"),
        room("bed", x=20, doorTo="liv", entrance=False),
    ))
    assert out == {"rooms": [
        {"id": "liv", "name": "Living", "type": "living", "x": 0, "z": 0, "w": 20, "d": 14.33, "floor": 0, "entrance": True},
        {"id": "bed", "name": "Room bed", "type": "bedroom", "x": 20, "z": 0, "w": 12, "d": 12, "floor": 0, "doorTo": "liv"},
    ]}


@pytest.mark.parametrize("raw, message", [
    ("x", "Floor plan: expected an object with a list of rooms"),
    ({"rooms": "x"}, "Floor plan: expected an object with a list of rooms"),
    (plan(5), "Floor plan: room 1 is not an object"),
    (plan(room(name=" ")), "Floor plan: room 1: give the room a name"),
    (plan(room(name="x" * 61)), "name is longer than 60 characters"),
    (plan(room(id="has space")), "Floor plan: Room a: invalid id"),
    (plan(room("a"), room("a", x=20)), "Floor plan: Room a: duplicate id"),
    (plan(room(type="garage")), "unknown room type"),
    (plan(room(w=1.5)), "Floor plan: Room a: width must be between 2 and 200"),
    (plan(room(d=201)), "depth must be between 2 and 200"),
    (plan(room(w="wide")), "width must be a number"),
    (plan(room(w=True)), "width must be a number"),
    (plan(room(w=float("inf"))), "width must be a number"),
    (plan(room(x=-1)), "left position must be between 0 and 400"),
    (plan(room(x=300, w=150)), "the plan must fit within 400' × 400'"),
    (plan(room(floor=1.5)), "floor must be a whole number"),
    (plan(room(floor=4)), "floor must be between 0 and 3"),
    (plan(room("a"), room("b", x=11.5)), "Floor plan: Room a and Room b overlap"),
    (plan(room("a"), room("b", floor=1, doorTo="a")), "the door must lead to another room on the same floor"),
    (plan(room("a", doorTo="a")), "the door must lead to another room on the same floor"),
    (plan(room("a", doorTo="zz")), "the door must lead to another room on the same floor"),
    (plan(room("a", entrance=True), room("b", x=12, entrance=True)), "mark only one room as the entrance"),
    (plan(room("a"), room("b", floor=1, entrance=True)), "the entrance must be on the ground floor"),
    (plan(room("a", floor=1)), "add at least one ground-floor room"),
    (plan(room("a"), room("b", floor=2)), "floors must be consecutive"),
])
def test_rejects(raw, message):
    assert message in error(raw)


def test_touching_rooms_and_stacked_floors_are_fine():
    out = parse_room_layout(plan(room("a"), room("b", x=12), room("c", z=12), room("up", floor=1)))
    assert len(out["rooms"]) == 4


def test_room_count_limit():
    rooms = [room(f"r{i}", x=(i % 10) * 10, z=(i // 10) * 10, w=10, d=10) for i in range(MAX_ROOMS)]
    assert len(parse_room_layout(plan(*rooms))["rooms"]) == MAX_ROOMS
    rooms.append(room("extra", x=0, z=200, w=10, d=10))
    assert error(plan(*rooms)) == f"Floor plan: at most {MAX_ROOMS} rooms"


# ---------------------------------------------------------------- API


@pytest.fixture(scope="module")
def owner():
    return make_client(email="owner@skyline.demo")


@pytest.fixture(autouse=True)
def cleanup():
    yield
    purge_test_properties("skyline")


LAYOUT = plan(room("liv", name="Living", type="living", w=18, d=14, entrance=True), room("bed", name="Bedroom", x=18, doorTo="liv"))


def test_save_and_read_back(owner):
    res = owner.post(API, json={**prop_payload(f"{PREFIX} {tag()}", status="ACTIVE"), "roomLayout": LAYOUT})
    assert res.status_code == 200, res.text
    pid = res.json()["id"]
    stored = parse_room_layout(LAYOUT)

    edit = owner.get(f"{API}/{pid}").json()
    assert edit["initial"]["roomLayout"] == stored
    slug = edit["property"]["slug"]
    assert make_client().get(f"/api/public/properties/{slug}").json()["property"]["roomLayout"] == stored
    # The list page stays light.
    assert all("roomLayout" not in r for r in owner.get(API).json()["rows"])

    # Updating without the key keeps it; null clears it.
    body = prop_payload(edit["initial"]["title"], status="ACTIVE")
    assert owner.put(f"{API}/{pid}", json=body).status_code == 200
    assert owner.get(f"{API}/{pid}").json()["initial"]["roomLayout"] == stored
    assert owner.put(f"{API}/{pid}", json={**body, "roomLayout": None}).status_code == 200
    assert owner.get(f"{API}/{pid}").json()["initial"]["roomLayout"] is None


def test_invalid_layout_is_refused(owner):
    bad = plan(room("a"), room("b", x=5))
    res = owner.post(API, json={**prop_payload(f"{PREFIX} {tag()}"), "roomLayout": bad})
    assert res.status_code == 400
    assert res.json()["error"] == "Floor plan: Room a and Room b overlap"


def test_new_form_starts_without_layout(owner):
    assert owner.get(f"{API}/new").json()["initial"]["roomLayout"] is None
