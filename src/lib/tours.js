import { apiOrNull } from "@/lib/api";
import { formatPrice } from "@/lib/format";

/** Loads a published tour (or a draft, for signed-in staff previews) shaped for the client viewer. Returns null if unavailable. */
export async function loadPublicTour(tenant, id, { allowDraft = false } = {}) {
  const tour = await apiOrNull(`/api/public/tours/${encodeURIComponent(id)}`, { query: allowDraft ? { draft: 1 } : undefined });
  if (!tour) return null;
  const { price, listingType, priceUnit, ...property } = tour.property;
  return { ...tour, property: { ...property, priceLabel: formatPrice(price, { currency: tenant.currency, listingType, priceUnit }) } };
}
