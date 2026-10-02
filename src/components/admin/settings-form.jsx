"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Globe, Lock, Palette, Save, SlidersHorizontal, Store, Plug, MapPin } from "lucide-react";
import { saveSettings } from "@/app/admin/(panel)/settings/actions";
import { DropZone, ImageListField, useUploader } from "@/components/admin/image-uploader";
import { LocationPicker } from "@/components/admin/location-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Chip, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { CURRENCIES, FONT_CHOICES, MAP_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PALETTES = [
  ["#0f766e", "#f59e0b", "Teal & amber"],
  ["#1e3a8a", "#f97316", "Navy & orange"],
  ["#7c2d12", "#d4a373", "Terracotta"],
  ["#111827", "#c9a24b", "Black & gold"],
  ["#4338ca", "#14b8a6", "Indigo & mint"],
  ["#9f1239", "#fbbf24", "Ruby & sun"],
];

function readable(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#0b0b0f" : "#fff";
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} className="size-11 cursor-pointer rounded-xl border border-input bg-card p-1" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className="font-mono uppercase" aria-label={label} />
      </div>
    </Field>
  );
}

function Locked({ children, reason, ok }) {
  if (ok) return children;
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-45" aria-hidden>{children}</div>
      <div className="absolute inset-0 grid place-items-center">
        <ButtonLink href="/admin/plan" variant="accent" size="sm"><Lock className="size-3.5" /> {reason}</ButtonLink>
      </div>
    </div>
  );
}

export function SettingsForm({ initial, features, rootDomain }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const logo = useUploader("logo");
  const [mapKey, setMapKey] = useState(0);
  const set = (patch) => setV((c) => ({ ...c, ...patch }));
  const bind = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ [k]: e.target.value }) });
  const social = (k) => ({ value: v.socials[k] || "", onChange: (e) => set({ socials: { ...v.socials, [k]: e.target.value } }) });

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await saveSettings({ ...v, heroImages: v.heroImages.map((h) => h.url) });
      if (res.ok) {
        toast.success("Settings saved. Your site is updated.");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  return (
    <form onSubmit={submit}>
      <Tabs defaultValue="brand">
        <TabsList className="mb-5 flex-wrap">
          <TabsTrigger value="brand"><Palette className="mr-1.5 inline size-4" /> Brand</TabsTrigger>
          <TabsTrigger value="business"><Store className="mr-1.5 inline size-4" /> Business</TabsTrigger>
          <TabsTrigger value="market"><MapPin className="mr-1.5 inline size-4" /> Market & map</TabsTrigger>
          <TabsTrigger value="leads"><SlidersHorizontal className="mr-1.5 inline size-4" /> Lead handling</TabsTrigger>
          <TabsTrigger value="connect"><Plug className="mr-1.5 inline size-4" /> Integrations</TabsTrigger>
          <TabsTrigger value="domain"><Globe className="mr-1.5 inline size-4" /> Domain</TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Colors & type</h2>
            <p className="mb-4 text-sm text-muted-foreground">Every button, badge, map pin and gradient on your site follows these.</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {PALETTES.map(([p, a, label]) => (
                <button key={label} type="button" onClick={() => set({ primaryColor: p, accentColor: a })} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-foreground/40", v.primaryColor === p && v.accentColor === a ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                  <span className="size-4 rounded-full" style={{ background: p }} /><span className="-ml-2 size-4 rounded-full ring-2 ring-card" style={{ background: a }} /> {label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Primary color" value={v.primaryColor} onChange={(primaryColor) => set({ primaryColor })} />
              <ColorField label="Accent color" value={v.accentColor} onChange={(accentColor) => set({ accentColor })} />
              <Field label="Heading font">
                <Select {...bind("fontHeading")}>{FONT_CHOICES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>
              </Field>
              <Field label="Body font">
                <Select {...bind("fontBody")}>{FONT_CHOICES.filter((f) => f.kind !== "heading").map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select>
              </Field>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-border">
              <div className="flex flex-wrap items-center gap-3 p-5" style={{ background: `linear-gradient(135deg, ${v.primaryColor}, ${v.primaryColor}cc)`, color: readable(v.primaryColor) }}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-widest opacity-80">Live preview</p>
                  <p className="font-heading text-2xl font-semibold">{v.name || "Your brand"}</p>
                  <p className="text-sm opacity-90">{v.tagline || "Find a home you will love"}</p>
                </div>
                <span className="rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg" style={{ background: v.accentColor, color: readable(v.accentColor) }}>Book a viewing</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Logo & hero</h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-[16rem_1fr]">
              <div>
                <p className="mb-1.5 text-sm font-medium">Logo</p>
                <div className="mb-3 grid h-24 place-items-center rounded-2xl border border-border bg-muted/50 p-3">
                  {v.logoUrl ? <img src={v.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo, name shown instead</span>}
                </div>
                <DropZone
                  compact
                  multiple={false}
                  uploading={logo.uploading}
                  progress={logo.progress}
                  label={v.logoUrl ? "Replace logo" : "Upload logo"}
                  onFiles={async (files) => {
                    const [f] = await logo.upload(files.slice(0, 1));
                    if (f) set({ logoUrl: f.url });
                  }}
                />
                {v.logoUrl && <button type="button" onClick={() => set({ logoUrl: "" })} className="mt-2 text-xs text-muted-foreground hover:text-danger">Remove logo</button>}
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Home page hero images</p>
                <ImageListField value={v.heroImages} onChange={(heroImages) => set({ heroImages })} max={6} />
                <Field label="Hero video (optional)" hint="A direct .mp4 URL plays behind the headline on desktop." className="mt-4">
                  <Input type="url" {...bind("heroVideoUrl")} placeholder="https://" />
                </Field>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="space-y-5">
          <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Business name"><Input required {...bind("name")} /></Field>
            <Field label="Tagline"><Input {...bind("tagline")} maxLength={140} placeholder="Homes with a view" /></Field>
            <Field label="About" className="sm:col-span-2"><Textarea rows={5} {...bind("about")} maxLength={2000} /></Field>
            <Field label="Contact email"><Input type="email" {...bind("contactEmail")} /></Field>
            <Field label="Phone"><Input {...bind("contactPhone")} /></Field>
            <Field label="WhatsApp number" hint="Digits with country code, e.g. 919820011001. Powers the chat button."><Input {...bind("whatsapp")} /></Field>
            <Field label="Office address"><Input {...bind("address")} /></Field>
          </Card>
          <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <h2 className="font-heading text-xl font-semibold sm:col-span-2">Social links</h2>
            {["instagram", "facebook", "linkedin", "youtube", "x"].map((k) => (
              <Field key={k} label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}><Input type="url" {...social(k)} placeholder="https://" /></Field>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="market" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Currency & units</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Currency"><Select {...bind("currency")}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}</Select></Field>
              <Field label="Area unit"><Select {...bind("areaUnit")}><option>sq ft</option><option>sq m</option><option>sq yd</option></Select></Field>
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Default map view</h2>
            <p className="mb-3 text-sm text-muted-foreground">Where the search map opens for visitors.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {MAP_PRESETS.map((p) => (
                <Chip key={p.label} active={Math.abs(v.mapLat - p.lat) < 0.01 && Math.abs(v.mapLng - p.lng) < 0.01} onClick={() => {
                set({ mapLat: p.lat, mapLng: p.lng, mapZoom: p.zoom });
                setMapKey((k) => k + 1);
              }}>{p.label}</Chip>
              ))}
            </div>
            <LocationPicker key={mapKey} lat={Number(v.mapLat)} lng={Number(v.mapLng)} zoom={Number(v.mapZoom)} onChange={({ lat, lng }) => setV((c) => ({ ...c, mapLat: lat, mapLng: lng }))} />
            <Field label={`Opening zoom: ${Number(v.mapZoom).toFixed(1)}`} className="mt-3">
              <input type="range" min="8" max="16" step="0.5" value={v.mapZoom} onChange={(e) => set({ mapZoom: Number(e.target.value) })} className="w-full accent-[var(--primary)]" aria-label="Opening zoom" />
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="leads">
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Response SLA</h2>
            <p className="mb-4 text-sm text-muted-foreground">If a broker does not make first contact in time, the lead is automatically reassigned.</p>
            <Locked ok={features.slaAutomation} reason="SLA automation needs Pro">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First-response SLA (minutes)" hint="Default for all rules. A rule can override it."><Input type="number" min="1" max="1440" {...bind("slaMinutes")} /></Field>
                <Field label="Max automatic reassignments" hint="After this many tries the lead escalates to the owner."><Input type="number" min="0" max="10" {...bind("maxReassigns")} /></Field>
              </div>
            </Locked>
          </Card>
        </TabsContent>

        <TabsContent value="connect" className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">WebInOrbit Analytics</h2>
            <p className="mb-4 text-sm text-muted-foreground">Paste your site ID to track visitors, searches and tour views with first-party analytics.</p>
            <Field label="Analytics site ID"><Input {...bind("analyticsSiteId")} placeholder="wio_xxxxxxxx" /></Field>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Webhook</h2>
            <p className="mb-4 text-sm text-muted-foreground">We POST a JSON event whenever a lead is created, assigned or escalated. Connect it to your CRM, Zapier or Slack.</p>
            <Locked ok={features.webhooks} reason="Webhooks need Enterprise">
              <Field label="Webhook URL"><Input type="url" {...bind("webhookUrl")} placeholder="https://hooks.example.com/leads" /></Field>
            </Locked>
          </Card>
        </TabsContent>

        <TabsContent value="domain">
          <Card className="p-5 sm:p-6">
            <h2 className="font-heading text-xl font-semibold">Custom domain</h2>
            <p className="mb-4 text-sm text-muted-foreground">Serve your site from your own address, with your branding only.</p>
            <Locked ok={features.customDomain} reason="Custom domains need Pro">
              <Field label="Domain" hint={`Add a CNAME record for this domain pointing to ${rootDomain || "your platform host"}, then save.`}>
                <Input {...bind("customDomain")} placeholder="homes.yourbrand.com" />
              </Field>
              <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Enter your domain above and save.</li>
                <li>At your DNS provider, create a CNAME to <code className="rounded bg-muted px-1.5 py-0.5">{rootDomain || "your-platform-host"}</code>.</li>
                <li>HTTPS is issued automatically by your hosting platform within minutes.</li>
              </ol>
            </Locked>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-3 z-30 mt-5 flex items-center justify-end gap-3 rounded-2xl border border-border bg-background/90 px-4 py-3 shadow-lift backdrop-blur-md">
        <Button type="submit" loading={pending}><Save className="size-4" /> Save settings</Button>
      </div>
    </form>
  );
}
