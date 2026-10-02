// Pure, client-safe helpers for the property search filter state (kept in the URL).

export const SORTS = [
  { value: "featured", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "area_desc", label: "Largest area" },
];

export const PRICE_RANGES = {
  SALE: { min: 0, max: 100_000_000, step: 500_000 },
  RENT: { min: 0, max: 500_000, step: 5_000 },
};

export const DEFAULT_FILTERS = {
  lt: "SALE",
  min: null,
  max: null,
  beds: null,
  baths: null,
  types: [],
  amen: [],
  q: "",
  minArea: null,
  maxArea: null,
  tour: false,
  feat: false,
  sort: "featured",
  bbox: null,
  poly: null,
  near: null,
};

const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function get(params, key) {
  if (!params) return undefined;
  if (typeof params.get === "function") return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilters(params) {
  const lt = String(get(params, "lt") || "").toUpperCase();
  const bboxRaw = list(get(params, "bbox")).map(Number);
  let poly = null;
  const polyRaw = get(params, "poly");
  if (polyRaw) {
    try {
      const ring = JSON.parse(polyRaw);
      if (Array.isArray(ring) && ring.length >= 3) poly = ring;
    } catch {}
  }
  const nearRaw = list(get(params, "near")).map(Number);
  return {
    lt: lt === "RENT" || lt === "SALE" ? lt : "SALE",
    min: num(get(params, "min")),
    max: num(get(params, "max")),
    beds: num(get(params, "beds")),
    baths: num(get(params, "baths")),
    types: list(get(params, "types")).map((t) => t.toUpperCase()),
    amen: list(get(params, "amen")),
    q: String(get(params, "q") || "").slice(0, 100),
    minArea: num(get(params, "minArea")),
    maxArea: num(get(params, "maxArea")),
    tour: get(params, "tour") === "1",
    feat: get(params, "feat") === "1",
    sort: SORTS.some((s) => s.value === get(params, "sort")) ? get(params, "sort") : "featured",
    bbox: bboxRaw.length === 4 && bboxRaw.every(Number.isFinite) ? bboxRaw : null,
    poly,
    near: nearRaw.length === 3 && nearRaw.every(Number.isFinite) ? nearRaw : null,
  };
}

/** Serialises filters back to a compact query string; defaults are omitted. */
export function filtersToQuery(filters, { includeViewport = true } = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const p = new URLSearchParams();
  if (f.lt && f.lt !== "SALE") p.set("lt", f.lt);
  if (f.min != null) p.set("min", String(f.min));
  if (f.max != null) p.set("max", String(f.max));
  if (f.beds != null) p.set("beds", String(f.beds));
  if (f.baths != null) p.set("baths", String(f.baths));
  if (f.types?.length) p.set("types", f.types.join(","));
  if (f.amen?.length) p.set("amen", f.amen.join(","));
  if (f.q) p.set("q", f.q);
  if (f.minArea != null) p.set("minArea", String(f.minArea));
  if (f.maxArea != null) p.set("maxArea", String(f.maxArea));
  if (f.tour) p.set("tour", "1");
  if (f.feat) p.set("feat", "1");
  if (f.sort && f.sort !== "featured") p.set("sort", f.sort);
  if (f.poly) p.set("poly", JSON.stringify(f.poly.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])));
  if (f.near) p.set("near", f.near.map((n, i) => (i < 2 ? n.toFixed(5) : n)).join(","));
  if (includeViewport && f.bbox) p.set("bbox", f.bbox.map((n) => n.toFixed(5)).join(","));
  return p.toString();
}

export function activeFilterCount(f) {
  let n = 0;
  if (f.min != null || f.max != null) n++;
  if (f.beds != null) n++;
  if (f.baths != null) n++;
  if (f.types?.length) n++;
  if (f.amen?.length) n++;
  if (f.q) n++;
  if (f.minArea != null || f.maxArea != null) n++;
  if (f.tour) n++;
  if (f.feat) n++;
  if (f.poly) n++;
  if (f.near) n++;
  return n;
}
