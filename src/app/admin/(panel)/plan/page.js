import { Check, Lock, Minus } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { PlanSwitcher } from "@/components/admin/plan-switcher";
import { cn } from "@/lib/utils";

export const metadata = { title: "Plan & billing" };

const FEATURE_ROWS = [
  { key: "maxListings", label: "Property listings", fmt: (v) => (Number.isFinite(v) ? v : "Unlimited") },
  { key: "maxBrokers", label: "Broker seats", fmt: (v) => (Number.isFinite(v) ? v : "Unlimited") },
  { key: "tours", label: "360° virtual tours" },
  { key: "routingRules", label: "Smart routing rules & simulator" },
  { key: "slaAutomation", label: "SLA timers & auto-reassignment" },
  { key: "csvImport", label: "Bulk CSV import" },
  { key: "customDomain", label: "Custom domain" },
  { key: "webhooks", label: "Webhooks & CRM integrations" },
  { key: "removeBranding", label: "Remove WebInOrbit branding" },
];

const LOCKED_COPY = {
  tours: "Virtual tours are available on Pro and Enterprise.",
  routingRules: "The routing engine is available on Pro and Enterprise.",
  csvImport: "Bulk CSV import is available on Pro and Enterprise.",
  customDomain: "Custom domains are available on Pro and Enterprise.",
  webhooks: "Webhooks are available on Enterprise.",
  maxListings: "You have reached your listing limit.",
  maxBrokers: "You have reached your broker seat limit.",
};

const unlimited = (cap) => (cap == null ? Infinity : cap);

export default async function PlanPage({ searchParams }) {
  const sp = await searchParams;
  await adminContext({ staffOnly: true });
  const data = await api("/api/admin/plan");
  const { tenant, canSwitch } = data;
  const current = data.current;
  const usage = data.usage.map((u) => ({ ...u, cap: unlimited(u.cap) }));
  const plans = data.plans.map((p) => ({ ...p, maxListings: unlimited(p.maxListings), maxBrokers: unlimited(p.maxBrokers) }));
  const lockedCopy = Object.hasOwn(LOCKED_COPY, sp.locked) ? LOCKED_COPY[sp.locked] : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Plan & billing" description={`${tenant.name} is on the ${current.label} plan.`} actions={canSwitch ? <PlanSwitcher current={tenant.plan} /> : null} />

      {lockedCopy && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm">
          <Lock className="size-5 shrink-0 text-accent" />
          <p><span className="font-semibold">{lockedCopy}</span> Upgrade below to unlock it instantly.</p>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {usage.map((u) => (
          <Card key={u.label} className="p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-muted-foreground">{u.label}</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">{u.used}<span className="text-base text-muted-foreground"> / {Number.isFinite(u.cap) ? u.cap : "∞"}</span></p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div className={cn("h-full rounded-full", Number.isFinite(u.cap) && u.used >= u.cap ? "bg-danger" : "bg-primary")} style={{ width: `${Number.isFinite(u.cap) ? Math.min(100, (u.used / u.cap) * 100) : 6}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const key = p.key;
          const active = key === tenant.plan;
          return (
            <Card key={key} className={cn("relative flex flex-col p-6", active && "border-primary ring-2 ring-primary/30", key === "PRO" && !active && "border-accent/60")}>
              {active && <Badge tone="primary" className="absolute right-4 top-4">Current plan</Badge>}
              {key === "PRO" && !active && <Badge tone="accent" className="absolute right-4 top-4">Most popular</Badge>}
              <h2 className="font-heading text-2xl font-semibold">{p.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.priceHint}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {FEATURE_ROWS.map((f) => {
                  const val = p[f.key];
                  const on = val === true || typeof val === "number";
                  return (
                    <li key={f.key} className={cn("flex items-start gap-2.5", !on && "text-muted-foreground/70")}>
                      {on ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <Minus className="mt-0.5 size-4 shrink-0" />}
                      <span>{f.fmt ? `${f.fmt(val)} ${f.label.toLowerCase()}` : f.label}</span>
                    </li>
                  );
                })}
              </ul>
              {!active && (
                <ButtonLink className="mt-6" variant={key === "PRO" ? "accent" : "outline"} href={`mailto:sales@webinorbit.com?subject=${encodeURIComponent(`Upgrade ${tenant.name} to ${p.label}`)}`}>
                  Talk to WebInOrbit
                </ButtonLink>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Plans are billed by WebInOrbit. Your site, data and leads are never affected when you change plans.</p>
    </div>
  );
}
