"""Validation of a listing's real floor plan (Property.roomLayout), used by the 3D designer instead of the generated one.

Shape (units are feet; x runs across the width, z from the front / street side to the back):
  {"rooms": [{"id", "name", "type", "x", "z", "w", "d", "floor", "doorTo"?: room id, "entrance"?: true}]}
Walls and doors are derived from the rooms by src/lib/layout3d.js. `doorTo` pins a room's door to one neighbour
(otherwise it is chosen automatically); `entrance` marks the ground-floor room with the front door.
"""

import math
import re
from typing import Any

from app.errors import UserError

ROOM_TYPES = [
    "living", "dining", "kitchen", "bedroom", "bath", "study", "utility", "stairs", "lounge", "terrace", "hall",
    "studio", "reception", "workspace", "cabin", "meeting", "pantry", "other",
]
MAX_ROOMS = 60
MAX_FLOORS = 4
MIN_SIDE = 2  # ft: anything smaller is a cupboard, not a room
MAX_SIDE = 200
MAX_EXTENT = 400  # ft: the whole plan must fit in a 400' x 400' square
_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
EPS = 0.01


def _num(v: Any, label: str, lo: float, hi: float, integer: bool = False) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise UserError(f"{label} must be a number")
    try:
        n = float(v)
    except ValueError:
        raise UserError(f"{label} must be a number") from None
    if not math.isfinite(n):
        raise UserError(f"{label} must be a number")
    if integer and not n.is_integer():
        raise UserError(f"{label} must be a whole number")
    if n < lo or n > hi:
        raise UserError(f"{label} must be between {lo:g} and {hi:g}")
    return int(n) if integer else round(n, 2)


def _overlap(a: dict, b: dict) -> bool:
    return (
        a["floor"] == b["floor"]
        and min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]) > EPS
        and min(a["z"] + a["d"], b["z"] + b["d"]) - max(a["z"], b["z"]) > EPS
    )


def parse_room_layout(raw: Any) -> dict | None:
    """Normalised layout, or None to fall back to the generated one. Raises UserError with a readable message."""
    if raw is None or raw == "":
        return None
    if not isinstance(raw, dict) or not isinstance(raw.get("rooms"), list):
        raise UserError("Floor plan: expected an object with a list of rooms")
    items = raw["rooms"]
    if not items:
        return None
    if len(items) > MAX_ROOMS:
        raise UserError(f"Floor plan: at most {MAX_ROOMS} rooms")

    rooms, seen = [], set()
    for n, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise UserError(f"Floor plan: room {n} is not an object")
        name = item.get("name").strip() if isinstance(item.get("name"), str) else ""
        label = f"Floor plan: {name or f'room {n}'}"
        if not name:
            raise UserError(f"{label}: give the room a name")
        if len(name) > 60:
            raise UserError(f"{label}: name is longer than 60 characters")
        rid = item.get("id")
        if not isinstance(rid, str) or not _ID.match(rid):
            raise UserError(f"{label}: invalid id")
        if rid in seen:
            raise UserError(f"{label}: duplicate id")
        seen.add(rid)
        kind = item.get("type")
        if kind not in ROOM_TYPES:
            raise UserError(f"{label}: unknown room type")
        room = {
            "id": rid,
            "name": name,
            "type": kind,
            "x": _num(item.get("x"), f"{label}: left position", 0, MAX_EXTENT),
            "z": _num(item.get("z"), f"{label}: front position", 0, MAX_EXTENT),
            "w": _num(item.get("w"), f"{label}: width", MIN_SIDE, MAX_SIDE),
            "d": _num(item.get("d"), f"{label}: depth", MIN_SIDE, MAX_SIDE),
            "floor": _num(item.get("floor", 0), f"{label}: floor", 0, MAX_FLOORS - 1, integer=True),
        }
        if room["x"] + room["w"] > MAX_EXTENT or room["z"] + room["d"] > MAX_EXTENT:
            raise UserError(f"{label}: the plan must fit within {MAX_EXTENT}' × {MAX_EXTENT}'")
        door = item.get("doorTo")
        if door not in (None, ""):
            if not isinstance(door, str):
                raise UserError(f"{label}: invalid door")
            room["doorTo"] = door
        if item.get("entrance") is True:
            room["entrance"] = True
        rooms.append(room)

    by_id = {r["id"]: r for r in rooms}
    for r in rooms:
        if "doorTo" in r:
            other = by_id.get(r["doorTo"])
            if other is None or other is r or other["floor"] != r["floor"]:
                raise UserError(f"Floor plan: {r['name']}: the door must lead to another room on the same floor")
        if r.get("entrance") and r["floor"] != 0:
            raise UserError(f"Floor plan: {r['name']}: the entrance must be on the ground floor")
    if sum(1 for r in rooms if r.get("entrance")) > 1:
        raise UserError("Floor plan: mark only one room as the entrance")
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            if _overlap(a, b):
                raise UserError(f"Floor plan: {a['name']} and {b['name']} overlap")
    floors = {r["floor"] for r in rooms}
    if 0 not in floors:
        raise UserError("Floor plan: add at least one ground-floor room")
    if floors != set(range(max(floors) + 1)):
        raise UserError("Floor plan: floors must be consecutive (no empty floor in between)")
    return {"rooms": rooms}
