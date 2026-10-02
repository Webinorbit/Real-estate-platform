import { api } from "@/lib/api";
import { getTenant, tenantFeatures } from "@/lib/tenant";
import { parseFilters } from "@/lib/filters";
import { MapSearch } from "@/components/map/map-search";

export async function generateMetadata({ searchParams }) {
  const tenant = await getTenant();
  const f = parseFilters(await searchParams);
  const kind = f.lt === "RENT" ? "Homes for rent" : "Homes for sale";
  return {
    title: f.q ? `${kind} in ${f.q}` : `${kind} on the map`,
    description: `Search ${kind.toLowerCase()} with ${tenant.name}: filter by price, bedrooms and area on an interactive map.`,
  };
}

export default async function PropertiesPage({ searchParams }) {
  const tenant = await getTenant();
  const features = tenantFeatures(tenant);
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [result, { localities }] = await Promise.all([
    api("/api/properties", { query: new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => [k, x]))) }),
    api("/api/public/localities", { query: { limit: 30 } }),
  ]);

  return (
    <MapSearch
      key={tenant.id}
      tenant={{
        slug: tenant.slug,
        currency: tenant.currency,
        locale: tenant.locale,
        areaUnit: tenant.areaUnit,
        mapLat: tenant.mapLat,
        mapLng: tenant.mapLng,
        mapZoom: tenant.mapZoom,
        toursEnabled: features.tours,
      }}
      initialFilters={filters}
      initialItems={result.items}
      localities={localities}
    />
  );
}
