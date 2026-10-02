"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import { createTenant, setTenantActive, setTenantPlan } from "@/app/admin/(panel)/tenants/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card } from "@/components/ui/misc";
import { MAP_PRESETS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

function TenantRow({ t }) {
  const [pending, start] = useTransition();
  return (
    <tr className={t.active ? "" : "opacity-60"}>
      <td className="px-5 py-3">
        <p className="font-semibold">{t.name}</p>
        <p className="text-xs text-muted-foreground">{t.slug}{t.customDomain && ` · ${t.customDomain}`}</p>
      </td>
      <td className="px-3 py-3">
        <select value={t.plan} disabled={pending} aria-label={`Plan for ${t.name}`} onChange={(e) => start(async () => { const r = await setTenantPlan(t.id, e.target.value); r.ok ? toast.success("Plan updated") : toast.error(r.error); })} className="h-8 rounded-lg border border-input bg-card px-2 text-xs font-medium">
          <option value="STARTER">Starter</option>
          <option value="PRO">Pro</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{t.properties}</td>
      <td className="px-3 py-3 text-right tabular-nums">{t.brokers}</td>
      <td className="px-3 py-3 text-right tabular-nums">{t.leads}</td>
      <td className="px-3 py-3 text-muted-foreground">{formatDate(t.createdAt)}</td>
      <td className="px-3 py-3"><Switch id={`t-${t.id}`} checked={t.active} disabled={pending} label={t.active ? "Live" : "Suspended"} onCheckedChange={(v) => start(async () => { const r = await setTenantActive(t.id, v); r.ok ? toast.success(v ? "Site is live" : "Site suspended") : toast.error(r.error); })} /></td>
      <td className="px-5 py-3 text-right">
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Open <ExternalLink className="size-3.5" /></a>
      </td>
    </tr>
  );
}

export function TenantsConsole({ tenants, cities }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", slug: "", plan: "PRO", ownerEmail: "", ownerName: "", city: "Mumbai", customDomain: "" });
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="size-4" /> New client</Button></div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Client</th><th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 text-right font-semibold">Listings</th><th className="px-3 py-3 text-right font-semibold">Team</th><th className="px-3 py-3 text-right font-semibold">Leads</th>
                <th className="px-3 py-3 font-semibold">Since</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">{tenants.map((t) => <TenantRow key={t.id} t={t} />)}</tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreated(null); }}>
        <DialogContent title={created ? "Client created" : "Onboard a new client"} description={created ? "Share these login details securely. The password is shown only once." : "Creates the site, the owner login and a starter broker profile."}>
          {created ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted p-4 font-mono text-sm">
                <p>Site: {created.url}</p><p>Admin: {created.url}/admin</p><p>Email: {created.email}</p><p>Password: {created.password}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`Site: ${created.url}\nAdmin: ${created.url}/admin\nEmail: ${created.email}\nPassword: ${created.password}`); setCopied(true); }}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
                </Button>
                <Button onClick={() => { setOpen(false); setCreated(null); }}>Done</Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await createTenant(form);
                  if (!r.ok) return toast.error(r.error);
                  setCreated({ ...r, url: `https://${form.customDomain || `${r.slug}.${cities.root}`}` });
                });
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name"><Input required value={form.name} onChange={(e) => set({ name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) })} /></Field>
                <Field label="Subdomain" hint={`${form.slug || "slug"}.${cities.root}`}><Input required value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" /></Field>
                <Field label="Owner name"><Input value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })} /></Field>
                <Field label="Owner email"><Input type="email" required value={form.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} /></Field>
                <Field label="Plan"><Select value={form.plan} onChange={(e) => set({ plan: e.target.value })}><option value="STARTER">Starter</option><option value="PRO">Pro</option><option value="ENTERPRISE">Enterprise</option></Select></Field>
                <Field label="Home city (map)"><Select value={form.city} onChange={(e) => set({ city: e.target.value })}>{MAP_PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}</Select></Field>
                <Field label="Custom domain (optional)" className="sm:col-span-2"><Input value={form.customDomain} onChange={(e) => set({ customDomain: e.target.value })} placeholder="homes.clientbrand.com" /></Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={pending}>Create client</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
