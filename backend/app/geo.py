import math

EARTH_KM = 6371


def haversine_km(a: dict, b: dict) -> float:
    to_rad = math.radians
    d_lat = to_rad(b["lat"] - a["lat"])
    d_lng = to_rad(b["lng"] - a["lng"])
    s = math.sin(d_lat / 2) ** 2 + math.cos(to_rad(a["lat"])) * math.cos(to_rad(b["lat"])) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(s))


def radius_bounds(lat: float, lng: float, km: float) -> dict:
    """Bounding box that fully contains a circle: used to prefilter in SQL before an exact distance check."""
    d_lat = math.degrees(km / EARTH_KM)
    d_lng = d_lat / max(math.cos(math.radians(lat)), 0.01)
    return {"south": lat - d_lat, "north": lat + d_lat, "west": lng - d_lng, "east": lng + d_lng}


def polygon_bounds(ring) -> dict:
    south, north, west, east = 90.0, -90.0, 180.0, -180.0
    for lng, lat in ring:
        south, north = min(south, lat), max(north, lat)
        west, east = min(west, lng), max(east, lng)
    return {"south": south, "north": north, "west": west, "east": east}


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def to_polygon(value):
    """Normalises a GeoJSON Polygon / Feature / bare ring into a closed Polygon geometry, or None."""
    if not value:
        return None
    geom = value
    if isinstance(geom, dict) and geom.get("type") == "Feature":
        geom = geom.get("geometry")
    if isinstance(geom, list):
        geom = {"type": "Polygon", "coordinates": [geom]}
    if not isinstance(geom, dict) or geom.get("type") != "Polygon":
        return None
    rings = geom.get("coordinates")
    if not isinstance(rings, list) or not rings or not isinstance(rings[0], list) or len(rings[0]) < 3:
        return None
    try:
        ring = [[float(p[0]), float(p[1])] for p in rings[0]]
    except (TypeError, ValueError, IndexError):
        return None
    if not all(_finite(x) and _finite(y) for x, y in ring):
        return None
    if ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    if len(ring) < 4:
        return None
    return {"type": "Polygon", "coordinates": [ring]}


def _in_ring(lng: float, lat: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-300) + xi:
            inside = not inside
        j = i
    return inside


def point_in_polygon(lng: float, lat: float, polygon_like) -> bool:
    poly = to_polygon(polygon_like)
    if not poly:
        return False
    rings = poly["coordinates"]
    if not _in_ring(lng, lat, rings[0]):
        return False
    return not any(_in_ring(lng, lat, hole) for hole in rings[1:])


def point_in_territory(lng: float, lat: float, territory) -> bool:
    """Territory can be a Polygon, MultiPolygon or FeatureCollection."""
    if not territory:
        return False
    t = territory.get("type") if isinstance(territory, dict) else None
    if t == "MultiPolygon":
        return any(point_in_polygon(lng, lat, {"type": "Polygon", "coordinates": c}) for c in territory["coordinates"])
    if t == "FeatureCollection":
        return any(point_in_territory(lng, lat, f.get("geometry")) for f in territory.get("features", []))
    return point_in_polygon(lng, lat, territory)


def valid_ring(value) -> bool:
    ring = value.get("coordinates", [None])[0] if isinstance(value, dict) and value.get("type") == "Polygon" else None
    return isinstance(ring, list) and len(ring) >= 4 and all(isinstance(p, list) and len(p) == 2 and all(_finite(c) for c in p) for p in ring)
