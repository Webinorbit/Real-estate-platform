import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { getTenant } from "@/lib/tenant";
import { formatNumber, formatPrice, pricePerArea, titleCase } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { CompareRemove } from "@/components/site/compare-remove";

export const metadata = { title: "Compare homes", robots: { index: false } };

export default async function ComparePage({ searchParams }) {
  const sp = await searchParams;
  const tenant = await getTenant();
  const ids = String(sp.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[\w-]{10,40}$/.test(s))
    .slice(0, 3);
  const items = ids.length ? (await api("/api/public/compare", { query: { ids: ids.join(",") } })).items : [];

  if (items.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-32">
        <EmptyState title="Pick at least two homes to compare" description="Use the compare icon on any listing card, then return here." action={<ButtonLink href="/properties?lt=SALE">Browse homes</ButtonLink>} />
      </div>
    );
  }

  const best = (fn, dir) => {
    const vals = items.map(fn);
    const target = dir === "min" ? Math.min(...vals.filter((v) => v > 0)) : Math.max(...vals);
    return (item) => fn(item) === target && vals.filter((v) => v === target).length < items.length;
  };
  const cheapest = best((p) => p.price, "min");
  const biggest = best((p) => p.areaSqft, "max");
  const value = best((p) => (p.areaSqft ? p.price / p.areaSqft : 0), "min");
  const moreBeds = best((p) => p.beds, "max");

  const specs = [
    { label: "Price", render: (p) => formatPrice(p.price, { currency: tenant.currency, listingType: p.listingType, priceUnit: p.priceUnit }), win: cheapest },
    { label: `Price per ${tenant.areaUnit}`, render: (p) => pricePerArea(p.price, p.areaSqft, tenant.currency) || "n/a", win: value },
    { label: "Type", render: (p) => titleCase(p.type) },
    { label: "Bedrooms", render: (p) => p.beds, win: moreBeds },
    { label: "Bathrooms", render: (p) => p.baths },
    { label: "Area", render: (p) => `${formatNumber(p.areaSqft, tenant.locale)} ${tenant.areaUnit}`, win: biggest },
    { label: "Locality", render: (p) => `${p.locality}, ${p.city}` },
    { label: "Furnishing", render: (p) => p.furnishing || "n/a" },
    { label: "Parking", render: (p) => p.parking || "n/a" },
    { label: "Year built", render: (p) => p.yearBuilt || "n/a" },
    { label: "Amenities", render: (p) => p.amenities.length },
  ];
  const allAmenities = [...new Set(items.flatMap((p) => p.amenities))].sort();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6">
      <h1 className="font-heading text-4xl font-semibold">Compare homes</h1>
      <p className="mb-8 mt-2 text-muted-foreground">
        <Trophy className="mr-1.5 inline size-4 text-accent" />
        Best value in each row is highlighted.
      </p>

      <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-40 p-4" />
              {items.map((p) => {
                const img = Array.isArray(p.images) ? p.images[0] : null;
                return (
                  <th key={p.id} className="p-4 align-top font-normal">
                    <Link href={`/properties/${p.slug}`} className="group block text-left">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                        {img && <Image src={img.url} alt={p.title} fill sizes="30vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                      </div>
                      <p className="mt-3 line-clamp-2 font-heading text-lg font-semibold leading-snug group-hover:text-primary">{p.title}</p>
                    </Link>
                    <CompareRemove id={p.id} ids={ids} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {specs.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="p-4 text-left font-medium text-muted-foreground">{row.label}</th>
                {items.map((p) => {
                  const win = row.win?.(p);
                  return (
                    <td key={p.id} className="p-4">
                      <span className={win ? "inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 font-semibold text-success" : "font-medium"}>
                        {win && <Trophy className="size-3.5" />}
                        {row.render(p)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {allAmenities.map((a) => (
              <tr key={a} className="border-t border-border">
                <th scope="row" className="p-4 text-left font-normal text-muted-foreground">{a}</th>
                {items.map((p) => (
                  <td key={p.id} className="p-4">
                    {p.amenities.includes(a) ? <span className="text-success" aria-label="Included">✓</span> : <span className="text-muted-foreground/50" aria-label="Not included">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
