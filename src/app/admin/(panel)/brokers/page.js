import { Clock, Globe2, MapPinned, Plus } from "lucide-react";
import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/misc";
import { BrokerCardActions } from "@/components/admin/broker-card-actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  await adminContext({ staffOnly: true });
  const { brokers, count, maxBrokers, atCap } = await api("/api/admin/brokers");
  const limited = maxBrokers != null;

  return (
    <div>
      <PageHeader
        title="Team"
        description={limited ? `${count} of ${maxBrokers} broker seats used.` : `${count} team members.`}
        actions={atCap ? <ButtonLink href="/admin/plan?locked=maxBrokers" variant="accent">Upgrade for more seats</ButtonLink> : <ButtonLink href="/admin/brokers/new"><Plus className="size-4" /> Add team member</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {brokers.map((b) => {
          const load = b.load || 0;
          const pct = Math.min(100, (load / b.capacity) * 100);
          const now = b.onShift;
          return (
            <Card key={b.id} className={cn("flex flex-col gap-4 p-5", !b.active && "opacity-70")}>
              <div className="flex items-start gap-3">
                <Avatar name={b.name} src={b.photoUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{b.title || b.email}</p>
                </div>
                {b.active ? <Badge tone={now ? "success" : "neutral"}><span className={cn("size-1.5 rounded-full", now ? "bg-success" : "bg-muted-foreground")} />{now ? "On shift" : "Off shift"}</Badge> : <Badge tone="warning">Paused</Badge>}
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Open leads</span>
                  <span className="tabular-nums"><span className="font-semibold">{load}</span> / {b.capacity}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-danger" : pct > 75 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-muted/60 py-2"><dt className="text-muted-foreground">Weight</dt><dd className="text-base font-semibold">{b.weight}</dd></div>
                <div className="rounded-xl bg-muted/60 py-2"><dt className="text-muted-foreground">Won</dt><dd className="text-base font-semibold">{b.won || 0}</dd></div>
                <div className="rounded-xl bg-muted/60 py-2"><dt className="text-muted-foreground">Territory</dt><dd className="text-base font-semibold">{b.territory ? "Set" : "—"}</dd></div>
              </dl>

              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {b.languages.length > 0 && <li className="flex items-center gap-2"><Globe2 className="size-3.5 shrink-0" /> {b.languages.join(", ")}</li>}
                {b.areas.length > 0 && <li className="flex items-center gap-2"><MapPinned className="size-3.5 shrink-0" /> <span className="truncate">{b.areas.join(", ")}</span></li>}
                <li className="flex items-center gap-2"><Clock className="size-3.5 shrink-0" /> {b.workingHours ? "Works scheduled hours" : "Always available"} · {b.timezone}</li>
              </ul>

              <div className="mt-auto">
                <BrokerCardActions id={b.id} name={b.name} active={b.active} openLeads={load} self={b.self} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
