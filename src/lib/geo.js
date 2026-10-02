import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

export const EARTH_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

/** Bounding box that fully contains a circle: used to prefilter in SQL before an exact distance check. */
export function radiusBounds(lat, lng, km) {
  const dLat = (km / EARTH_KM) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

export function polygonBounds(ring) {
  let south = 90, north = -90, west = 180, east = -180;
  for (const [lng, lat] of ring) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return { south, north, west, east };
}

/** Normalises a GeoJSON Polygon / Feature / array-of-ring into a closed Polygon geometry, or null. */
export function toPolygon(input) {
  if (!input) return null;
  let geom = input;
  if (geom.type === "Feature") geom = geom.geometry;
  if (Array.isArray(geom)) geom = { type: "Polygon", coordinates: [geom] };
  if (!geom || geom.type !== "Polygon" || !Array.isArray(geom.coordinates?.[0]) || geom.coordinates[0].length < 3) return null;
  const ring = geom.coordinates[0].map(([x, y]) => [Number(x), Number(y)]);
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push([fx, fy]);
  if (ring.length < 4) return null;
  return { type: "Polygon", coordinates: [ring] };
}

export function pointInPolygon(lng, lat, polygonLike) {
  const poly = toPolygon(polygonLike);
  if (!poly) return false;
  return booleanPointInPolygon([lng, lat], poly);
}

/** Territory can be one Polygon or a MultiPolygon-like array of polygons. */
export function pointInTerritory(lng, lat, territory) {
  if (!territory) return false;
  if (territory.type === "MultiPolygon") {
    return territory.coordinates.some((c) => pointInPolygon(lng, lat, { type: "Polygon", coordinates: c }));
  }
  if (territory.type === "FeatureCollection") {
    return territory.features.some((f) => pointInTerritory(lng, lat, f.geometry));
  }
  return pointInPolygon(lng, lat, territory);
}

export function circlePolygon(lng, lat, km, steps = 48) {
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const ang = (i / steps) * 2 * Math.PI;
    const dLat = (km / EARTH_KM) * (180 / Math.PI) * Math.sin(ang);
    const dLng = ((km / EARTH_KM) * (180 / Math.PI) * Math.cos(ang)) / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    ring.push([lng + dLng, lat + dLat]);
  }
  return { type: "Polygon", coordinates: [ring] };
}
