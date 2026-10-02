import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, Mail, MessageCircle, Phone, XCircle } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { apiOrNull } from "@/lib/api";
import { LEAD_SOURCES } from "@/lib/constants";
import { formatDateTime, formatPrice, timeAgo } from "@/lib/format";
import { Avatar, Badge, Card } from "@/components/ui/misc";
import { LeadActions } from "@/components/admin/lead-actions";
import { LeadStatusBadge, SlaCell } from "@/components/admin/lead-bits";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lead" };

const KIND_LABEL = { INITIAL: "Auto-routed", REASSIGN: "SLA reassign", ESCALATE: "Escalated", MANUAL: "Manual" };

export default async function LeadDetail({ params }) {
  const { id } = await params;
  const { tenant } = await adminContext();
  const data = await apiOrNull(`/api/admin/leads/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { lead, audit, brokers, isStaff } = data;
  const latest = lead.assignments[0];
  const wa = lead.phone?.replace(/\D/g, "");

  return (
    <div>
      <Link href="/admin/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All leads
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold">{lead.name}</h1>
            <LeadStatusBadge status={lead.status} />
            {lead.escalated && <Badge tone="danger">Escalated</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {LEAD_SOURCES.find((s) => s.value === lead.source)?.label} · received {timeAgo(lead.createdAt)} · {formatDateTime(lead.createdAt, tenant.locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted"><Phone className="size-4" /> Call</a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted"><MessageCircle className="size-4" /> WhatsApp</a>
          )}
          <a href={`mailto:${lead.email}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted"><Mail className="size-4" /> Email</a>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-lg font-semibold">Enquiry</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{lead.email}</dd></div>
              <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{lead.phone || "n/a"}</dd></div>
              <div><dt className="text-muted-foreground">Language</dt><dd className="font-medium">{lead.language || "Not specified"}</dd></div>
              <div><dt className="text-muted-foreground">SLA</dt><dd className="font-medium"><SlaCell lead={{ status: lead.status, slaDueAt: lead.slaDueAt?.toISOString() || null, firstResponseAt: lead.firstResponseAt?.toISOString() || null, createdAt: lead.createdAt.toISOString() }} /></dd></div>
              {lead.preferredAt && <div><dt className="text-muted-foreground">Preferred visit</dt><dd className="font-medium">{formatDateTime(lead.preferredAt, tenant.locale)}</dd></div>}
              {lead.lostReason && <div><dt className="text-muted-foreground">Lost reason</dt><dd className="font-medium">{lead.lostReason}</dd></div>}
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Message</dt><dd className="mt-1 rounded-xl bg-muted p-4 leading-relaxed">{lead.message || "No message provided."}</dd></div>
            </dl>
            {lead.property && (
              <Link href={`/properties/${lead.property.slug}`} target="_blank" className="mt-5 flex items-center justify-between rounded-xl border border-border p-4 transition hover:border-primary/50">
                <div>
                  <p className="text-xs text-muted-foreground">About</p>
                  <p className="font-semibold">{lead.property.title}</p>
                </div>
                <p className="font-heading text-lg font-semibold text-primary">{formatPrice(lead.property.price, { currency: tenant.currency, listingType: lead.property.listingType })}</p>
              </Link>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 font-heading text-lg font-semibold">Why this broker?</h2>
            <p className="mb-4 text-sm text-muted-foreground">The routing engine's decision trail for this lead.</p>
            {latest ? (
              <>
                <div className="flex items-center gap-3 rounded-xl bg-primary/8 p-4">
                  <Avatar name={latest.broker?.name} src={latest.broker?.photoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{latest.broker?.name || "Nobody (escalated)"}</p>
                    <p className="text-sm text-muted-foreground">{latest.ruleName || "No rule"}{latest.strategy ? ` · ${latest.strategy.replace("_", " ").toLowerCase()}` : ""}</p>
                  </div>
                  <Badge tone="primary">{KIND_LABEL[latest.kind]}</Badge>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {(latest.reasons || []).map((r, i) => (
                    <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {r}</li>
                  ))}
                </ul>

                {audit.trace.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules evaluated</p>
                    <ul className="space-y-1.5 text-sm">
                      {audit.trace.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {t.outcome === "selected" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : t.outcome === "skipped" ? <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" />}
                          <span><span className="font-medium">{t.ruleName}</span> <span className="text-muted-foreground">· {t.detail}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {audit.candidates.length > 0 && (
                  <div className="mt-5 overflow-x-auto">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brokers considered</p>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border">
                        {audit.candidates.map((c) => (
                          <tr key={c.brokerId} className={cn(c.brokerId === latest.brokerId && "bg-primary/8 font-semibold")}>
                            <td className="py-2 pr-3">{c.name}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{c.load}/{c.capacity} open</td>
                            <td className="py-2"><Badge tone={c.eligible ? "success" : "neutral"}>{c.eligible ? "eligible" : "skipped"}</Badge> <span className="text-xs font-normal text-muted-foreground">{c.eligible ? "" : c.why}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {lead.assignments.length > 1 && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment history</p>
                    <ol className="space-y-2 text-sm">
                      {lead.assignments.map((a) => (
                        <li key={a.id} className="flex items-center gap-2">
                          <Badge>{KIND_LABEL[a.kind]}</Badge>
                          <span>{a.broker?.name || "Unassigned"}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This lead has not been routed.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-lg font-semibold">Actions</h2>
            <LeadActions lead={{ id: lead.id, status: lead.status, brokerId: lead.brokerId }} brokers={brokers} isStaff={isStaff} />
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 font-heading text-lg font-semibold">Activity</h2>
            <ol className="relative space-y-5 border-l border-border pl-5">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative">
                  <span className={cn("absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-card", a.type === "SLA_BREACH" || a.type === "ESCALATE" ? "bg-danger" : a.type === "NOTE" ? "bg-accent" : "bg-primary")} />
                  <p className="text-sm">{a.note || a.type}</p>
                  <p className="text-xs text-muted-foreground">{a.actor} · {timeAgo(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
