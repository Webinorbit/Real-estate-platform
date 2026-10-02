import { PROPERTY_TYPES } from "@/lib/constants";

export const IMPORT_FIELDS = [
  { key: "title", label: "Title", required: true, aliases: ["title", "name", "property name", "listing title"] },
  { key: "listingType", label: "Sale / Rent", aliases: ["listing type", "listingtype", "for", "purpose", "sale or rent", "transaction"] },
  { key: "type", label: "Property type", aliases: ["type", "property type", "category"] },
  { key: "price", label: "Price", required: true, aliases: ["price", "amount", "rent", "cost", "asking price"] },
  { key: "beds", label: "Bedrooms", aliases: ["beds", "bedrooms", "bhk", "bed"] },
  { key: "baths", label: "Bathrooms", aliases: ["baths", "bathrooms", "bath"] },
  { key: "areaSqft", label: "Area", aliases: ["area", "sqft", "sq ft", "area sqft", "size", "carpet area", "builtup area"] },
  { key: "locality", label: "Locality", required: true, aliases: ["locality", "neighbourhood", "neighborhood", "area name", "suburb"] },
  { key: "city", label: "City", required: true, aliases: ["city", "town"] },
  { key: "address", label: "Address", aliases: ["address", "street", "street address"] },
  { key: "lat", label: "Latitude", aliases: ["lat", "latitude"] },
  { key: "lng", label: "Longitude", aliases: ["lng", "lon", "long", "longitude"] },
  { key: "description", label: "Description", aliases: ["description", "details", "about", "summary"] },
  { key: "amenities", label: "Amenities", aliases: ["amenities", "features", "facilities"] },
  { key: "images", label: "Image URLs", aliases: ["images", "image urls", "photos", "image", "photo urls", "pictures"] },
  { key: "status", label: "Status", aliases: ["status"] },
  { key: "yearBuilt", label: "Year built", aliases: ["year built", "yearbuilt", "year", "built"] },
  { key: "furnishing", label: "Furnishing", aliases: ["furnishing", "furnished"] },
  { key: "parking", label: "Parking", aliases: ["parking", "car parking"] },
  { key: "floor", label: "Floor", aliases: ["floor"] },
  { key: "totalFloors", label: "Total floors", aliases: ["total floors", "totalfloors", "floors"] },
  { key: "facing", label: "Facing", aliases: ["facing", "direction"] },
  { key: "state", label: "State", aliases: ["state", "region"] },
  { key: "postalCode", label: "Postal code", aliases: ["postal code", "postalcode", "pincode", "zip", "zipcode", "postcode"] },
];

export const TEMPLATE_CSV =
  "title,listing type,property type,price,bedrooms,bathrooms,area sqft,locality,city,latitude,longitude,description,amenities,image urls,status\n" +
  '"Sea-view 3 BHK in Bandra","sale","apartment",42000000,3,3,1850,"Bandra West","Mumbai",19.0596,72.8295,"Bright corner apartment with sea views.","Gym; Swimming Pool; Lift","https://example.com/a.jpg|https://example.com/b.jpg","active"\n';

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function autoMap(headers) {
  const map = {};
  const used = new Set();
  for (const f of IMPORT_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && f.aliases.includes(norm(h)));
    if (hit) {
      map[f.key] = hit;
      used.add(hit);
    }
  }
  return map;
}

const toNumber = (v) => {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : "";
};

/** Builds a Property payload from one raw CSV row and a { fieldKey: csvHeader } mapping. */
export function buildRow(raw, mapping) {
  const get = (k) => (mapping[k] ? String(raw[mapping[k]] ?? "").trim() : "");
  const lt = get("listingType").toLowerCase();
  const typeRaw = norm(get("type"));
  const type = PROPERTY_TYPES.find((t) => norm(t.value) === typeRaw || norm(t.label) === typeRaw || (typeRaw && norm(t.label).startsWith(typeRaw)))?.value || (typeRaw.includes("flat") ? "APARTMENT" : "APARTMENT");
  const status = get("status").toUpperCase();
  const imgs = get("images").split(/[|;\n]/).map((s) => s.trim()).filter((u) => /^https:\/\//i.test(u));
  const bhk = get("beds").match(/\d+/);
  return {
    title: get("title"),
    description: get("description"),
    listingType: /rent|lease/.test(lt) ? "RENT" : "SALE",
    type,
    status: ["DRAFT", "ACTIVE", "PENDING", "SOLD", "RENTED"].includes(status) ? status : "ACTIVE",
    price: toNumber(get("price")),
    priceUnit: /rent|lease/.test(lt) ? "month" : null,
    beds: bhk ? Number(bhk[0]) : 0,
    baths: toNumber(get("baths")) || 0,
    areaSqft: toNumber(get("areaSqft")) || 0,
    yearBuilt: toNumber(get("yearBuilt")),
    furnishing: get("furnishing"),
    parking: toNumber(get("parking")) || 0,
    floor: toNumber(get("floor")),
    totalFloors: toNumber(get("totalFloors")),
    facing: get("facing"),
    address: get("address"),
    locality: get("locality"),
    city: get("city"),
    state: get("state"),
    postalCode: get("postalCode"),
    lat: get("lat") === "" ? null : toNumber(get("lat")),
    lng: get("lng") === "" ? null : toNumber(get("lng")),
    amenities: get("amenities").split(/[;|,]/).map((s) => s.trim()).filter(Boolean),
    images: imgs.map((url) => ({ url, alt: "" })),
    featured: false,
  };
}

/** Validates a built row. Missing coordinates are allowed (`needsGeocode`) and resolved server-side. */
/**
 * Quick pre-flight check so obvious mistakes show up before upload. The API validates every row again
 * (full schema, plan limits, geocoding) when it is imported.
 */
export function checkRow(row) {
  const needsGeocode = row.lat === null || row.lng === null || row.lat === "" || row.lng === "";
  const fail = (error) => ({ ok: false, error, needsGeocode });
  const text = (v) => String(v ?? "").trim();

  if (text(row.title).length < 3) return fail("title: Give the listing a title");
  if (!["SALE", "RENT"].includes(row.listingType)) return fail("listingType: Must be SALE or RENT");
  if (!PROPERTY_TYPES.some((t) => t.value === row.type)) return fail("type: Unknown property type");
  if (!(Number(row.price) >= 1)) return fail("price: Enter a price");
  if (!text(row.locality)) return fail("locality: Locality is required");
  if (!text(row.city)) return fail("city: City is required");
  if (!needsGeocode) {
    if (!(Math.abs(Number(row.lat)) <= 90)) return fail("lat: Latitude must be between -90 and 90");
    if (!(Math.abs(Number(row.lng)) <= 180)) return fail("lng: Longitude must be between -180 and 180");
  }
  return { ok: true, needsGeocode };
}
