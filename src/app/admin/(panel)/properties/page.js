import Image from "next/image";
import Link from "next/link";
import { Building2, Plus, Search, Upload } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PROPERTY_STATUSES } from "@/lib/constants";
import { formatPriceCompact, titleCase } from "@/lib/format";
import { firstImage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { PropertyRowActions } from "@/components/admin/property-row-actions";

export const metadata = { title: "Properties" };
const TONE = { ACTIVE: "success", DRAFT: "neutral", PENDING: "warning", SOLD: "primary", RENTED: "primary" };

export default async function PropertiesAdminPage({ searchParams }) {
  const sp = await searchParams;
  const { tenant, features } = await adminContext({ staffOnly: true });
  const status = PROPERTY_STATUSES.includes(sp.status) ? sp.status : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, counts: countMap, all, cap, atCap, pages } = await api("/api/admin/properties", { query: { status, q, page } });

  const href = (patch) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: sp.status, q, ...patch })) if (v) p.set(k, v);
    return `/admin/properties?${p}`;
  };
  const pill = (active) => cn("rounded-full border px-4 py-2 text-sm font-medium transition", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/40");

  return (
    <div>
      <PageHeader
        title="Properties"
        description={Number.isFinite(cap) ? `${all} of ${cap} listings used on your ${tenant.plan.toLowerCase()} plan.` : `${all} listings · unlimited on your ${tenant.plan.toLowerCase()} plan.`}
        actions={
          <>
            {features.csvImport && (
              <ButtonLink href="/admin/import" variant="outline"><Upload className="size-4" /> Import CSV</ButtonLink>
            )}
            {atCap ? <ButtonLink href="/admin/plan" variant="accent">Upgrade for more listings</ButtonLink> : <ButtonLink href="/admin/properties/new"><Plus className="size-4" /> New property</ButtonLink>}
          </>
        }
      />

      {Number.isFinite(cap) && (
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={all} aria-valuemax={cap} aria-label="Listing quota">
          <div className={cn("h-full rounded-full transition-all", atCap ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(100, (all / cap) * 100)}%` }} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href({ status: null, page: null })} className={pill(!status)}>All <span className="ml-1 opacity-70">{all}</span></Link>
        {PROPERTY_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s, page: null })} className={pill(status === s)}>
            {titleCase(s)} <span className="ml-1 opacity-70">{countMap[s] || 0}</span>
          </Link>
        ))}
        <form action="/admin/properties" className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="Search" name="q" defaultValue={q} placeholder="Search title, locality, city" className="h-10 w-full sm:w-60 rounded-xl border border-input bg-card pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
          </div>
          <button className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={all === 0 ? "No listings yet" : "No properties match"} description={all === 0 ? "Add your first property to bring the map to life." : "Try another filter or search term."} action={all === 0 ? <ButtonLink href="/admin/properties/new">Add property</ButtonLink> : null} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Property</th>
                  <th className="px-3 py-3 font-semibold">Price</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Agent</th>
                  <th className="px-3 py-3 text-right font-semibold">Views</th>
                  <th className="px-3 py-3 text-right font-semibold">Leads</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link href={`/admin/properties/${p.id}`} className="group flex items-center gap-3">
                        <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                          <Image src={firstImage(p.images)} alt="" fill sizes="56px" className="object-cover" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold group-hover:text-primary">{p.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.locality}, {p.city} · {p.listingType === "RENT" ? "For rent" : "For sale"}
                            {p._count.tours > 0 && " · 360° tour"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-medium">{formatPriceCompact(p.price, tenant.currency)}{p.listingType === "RENT" && <span className="text-xs text-muted-foreground">/{p.priceUnit || "mo"}</span>}</td>
                    <td className="px-3 py-3"><Badge tone={TONE[p.status]}>{titleCase(p.status)}</Badge></td>
                    <td className="px-3 py-3 text-muted-foreground">{p.listingBroker?.name || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.views}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p._count.leads}</td>
                    <td className="px-5 py-3"><PropertyRowActions id={p.id} slug={p.slug} status={p.status} featured={p.featured} title={p.title} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <span className="text-muted-foreground">{total} properties · page {page} of {pages}</span>
              <div className="flex gap-2">
                {page > 1 && <Link href={href({ page: page - 1 })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">Previous</Link>}
                {page < pages && <Link href={href({ page: page + 1 })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">Next</Link>}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
