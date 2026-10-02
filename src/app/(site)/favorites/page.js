import { getTenant } from "@/lib/tenant";
import { cardTenant } from "@/lib/format";
import { FavoritesView } from "@/components/site/favorites-view";

export const metadata = { title: "Your favourites", robots: { index: false } };

export default async function FavoritesPage() {
  const tenant = await getTenant();
  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6">
      <h1 className="font-heading text-4xl font-semibold">Your favourites</h1>
      <p className="mb-8 mt-2 text-muted-foreground">Homes you have saved. Compare them side by side or share them with family.</p>
      <FavoritesView tenant={cardTenant(tenant)} />
    </div>
  );
}
