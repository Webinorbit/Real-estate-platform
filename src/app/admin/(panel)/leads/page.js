import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { LeadStatusBadge, SlaCell } from "@/components/admin/lead-bits";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads" };

const text = (v) => (typeof v === "string" ? v : undefined);

export default async function LeadsPage({ searchParams }) {
  const sp = await searchParams;
  await adminContext();
  const { leads: rows, total, page, pages, counts: countMap, allCount, brokers, filters, isStaff } = await api("/api/admin/leads", {
    query: { status: text(sp.status), broker: text(sp.broker), q: text(sp.q), page: text(sp.page) },
  });
  const status = filters.status;
  const q = filters.q;

  const href = (patch) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, broker: sp.broker, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/leads?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Leads" description="Every enquiry, auto-routed to the right broker." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href({ status: null, page: null })} className={cn("rounded-full border px-4 py-2 text-sm font-medium transition", !status ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/40")}>
          All <span className="ml-1 opacity-70">{allCount}</span>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s.value} href={href({ status: s.value, page: null })} className={cn("rounded-full border px-4 py-2 text-sm font-medium transition", status === s.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/40")}>
            {s.label} <span className="ml-1 opacity-70">{countMap[s.value] || 0}</span>
          </Link>
        ))}
        <form action="/admin/leads" className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {isStaff && (
            <select name="broker" defaultValue={sp.broker || ""} className="h-10 rounded-xl border border-input bg-card px-3 text-sm" aria-label="Filter by broker">
              <option value="">All brokers</option>
              <option value="unassigned">Unassigned</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="Search" name="q" defaultValue={q} placeholder="Search name, email, phone" className="h-10 w-full sm:w-56 rounded-xl border border-input bg-card pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
          </div>
          <button className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">Filter</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No leads match" description="Try a different filter, or wait for the next enquiry to roll in." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Lead</th>
                  <th className="px-3 py-3 font-semibold">Property</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Assigned to</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">SLA</th>
                  <th className="px-5 py-3 text-right font-semibold">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => (
                  <tr key={l.id} className="group transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/leads/${l.id}`} className="block">
                        <p className="font-semibold group-hover:text-primary">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.email}</p>
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-3.5 text-muted-foreground">{l.property?.title || "General enquiry"}</td>
                    <td className="px-3 py-3.5"><Badge>{LEAD_SOURCES.find((s) => s.value === l.source)?.label}</Badge></td>
                    <td className="px-3 py-3.5">
                      {l.broker ? (
                        <span className="flex items-center gap-2"><Avatar name={l.broker.name} src={l.broker.photoUrl} size={26} />{l.broker.name}</span>
                      ) : (
                        <Badge tone="danger">Unassigned</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3.5"><LeadStatusBadge status={l.status} />{l.escalated && <Badge tone="danger" className="ml-1.5">Escalated</Badge>}</td>
                    <td className="px-3 py-3.5"><SlaCell lead={{ status: l.status, slaDueAt: l.slaDueAt?.toISOString() || null, firstResponseAt: l.firstResponseAt?.toISOString() || null, createdAt: l.createdAt.toISOString() }} /></td>
                    <td className="px-5 py-3.5 text-right text-muted-foreground">{timeAgo(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <span className="text-muted-foreground">{total} leads · page {page} of {pages}</span>
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
