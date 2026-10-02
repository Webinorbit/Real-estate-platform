"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Save } from "lucide-react";
import { saveBroker } from "@/app/admin/(panel)/brokers/actions";
import { DropZone, useUploader } from "@/components/admin/image-uploader";
import { PolygonEditor } from "@/components/admin/polygon-editor";
import { TagInput } from "@/components/admin/tag-input";
import { Button } from "@/components/ui/button";
import { Chip, Field, Input, Select, SegmentedControl, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, Card } from "@/components/ui/misc";
import { DAYS, DEFAULT_WORKING_HOURS, LANGUAGES } from "@/lib/constants";

const DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

function Section({ title, description, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </Card>
  );
}

export function BrokerForm({ id, initial, mapCenter, isSelf, lockedRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [creds, setCreds] = useState(null);
  const [copied, setCopied] = useState(false);
  const photo = useUploader("logo");
  const set = (patch) => setV((c) => ({ ...c, ...patch }));
  const bind = (k) => ({ value: v[k] ?? "", onChange: (e) => set({ [k]: e.target.value }) });
  const zones = ZONES.includes(v.timezone) ? ZONES : [v.timezone, ...ZONES];
  const scheduled = Boolean(v.workingHours);

  const setDay = (day, slot) => set({ workingHours: { ...v.workingHours, [day]: slot } });

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await saveBroker(id || null, v);
      if (!res.ok) return toast.error(res.error);
      toast.success(id ? "Team member saved" : "Team member added");
      if (!id) {
        if (res.tempPassword) return setCreds({ email: v.email, password: res.tempPassword, to: `/admin/brokers/${res.id}` });
        return router.replace(`/admin/brokers/${res.id}`);
      }
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section title="Profile">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={v.name || "?"} src={v.photoUrl} size={72} />
          <div className="max-w-xs flex-1">
            <DropZone
              compact
              multiple={false}
              uploading={photo.uploading}
              progress={photo.progress}
              label={v.photoUrl ? "Replace photo" : "Upload a photo"}
              onFiles={async (files) => {
                const [f] = await photo.upload(files.slice(0, 1));
                if (f) set({ photoUrl: f.url });
              }}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input required {...bind("name")} placeholder="Priya Sharma" /></Field>
          <Field label="Job title"><Input {...bind("title")} placeholder="Senior Luxury Advisor" /></Field>
          <Field label="Email (their login)"><Input type="email" required {...bind("email")} /></Field>
          <Field label="Phone / WhatsApp"><Input {...bind("phone")} placeholder="+91 98200 00000" /></Field>
          <Field label="Short bio" className="sm:col-span-2"><Textarea rows={3} {...bind("bio")} maxLength={600} /></Field>
        </div>
      </Section>

      <Section title="Access" description={id ? "Leave the password blank to keep it unchanged." : "Leave the password blank and we will generate one for you."}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password"><Input type="text" autoComplete="new-password" {...bind("password")} placeholder={id ? "Unchanged" : "Auto-generate"} minLength={8} /></Field>
          <Field label="Role" hint="Admins can manage listings, team and settings. Brokers only see their own leads.">
            {lockedRole ? (
              <Input value={lockedRole} disabled readOnly />
            ) : (
              <SegmentedControl value={v.role} onChange={(role) => set({ role })} options={[{ value: "BROKER", label: "Broker" }, { value: "ADMIN", label: "Admin" }]} />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Expertise" description="Used by routing rules that match language, area or specialty.">
        <div className="space-y-4">
          <Field label="Languages spoken">
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Chip key={l} active={v.languages.includes(l)} onClick={() => set({ languages: v.languages.includes(l) ? v.languages.filter((x) => x !== l) : [...v.languages, l] })}>{l}</Chip>
              ))}
            </div>
          </Field>
          <Field label="Areas / localities served" hint="Press Enter after each area.">
            <TagInput value={v.areas} onChange={(areas) => set({ areas })} placeholder="Bandra West, Juhu…" />
          </Field>
          <Field label="Specialties">
            <TagInput value={v.specialties} onChange={(specialties) => set({ specialties })} placeholder="Villas, Rentals, Luxury…" suggestions={["Villas", "Rentals", "Luxury", "Commercial", "Plots", "First-time buyers", "Investment", "Resale"]} />
          </Field>
        </div>
      </Section>

      <Section title="Lead capacity" description="The routing engine never assigns beyond capacity unless every broker is full.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max open leads"><Input type="number" min="1" max="500" {...bind("capacity")} /></Field>
          <Field label={`Priority weight: ${v.weight}`} hint="Higher weight means a larger share when using the weighted strategy.">
            <input type="range" min="1" max="10" value={v.weight} onChange={(e) => set({ weight: Number(e.target.value) })} className="mt-3 w-full accent-[var(--primary)]" aria-label="Priority weight" />
          </Field>
        </div>
      </Section>

      <Section title="Availability" description="Outside these hours, new leads skip this broker.">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Switch id="scheduled" checked={scheduled} onCheckedChange={(on) => set({ workingHours: on ? { ...DEFAULT_WORKING_HOURS } : null })} label="Restrict to working hours" />
          <div className="w-56"><Select aria-label="Time zone" {...bind("timezone")}>{zones.map((z) => <option key={z}>{z}</option>)}</Select></div>
        </div>
        {scheduled && (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {DAYS.map((d) => {
              const slot = v.workingHours[d];
              return (
                <li key={d} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="w-24 text-sm font-medium">{DAY_LABEL[d]}</span>
                  <Switch id={`day-${d}`} checked={Boolean(slot)} onCheckedChange={(on) => setDay(d, on ? ["09:00", "19:00"] : null)} label={slot ? "" : "Day off"} />
                  {slot && (
                    <span className="flex items-center gap-2 text-sm">
                      <input type="time" value={slot[0]} onChange={(e) => setDay(d, [e.target.value, slot[1]])} className="h-9 rounded-lg border border-input bg-card px-2" aria-label={`${DAY_LABEL[d]} start`} />
                      <span className="text-muted-foreground">to</span>
                      <input type="time" value={slot[1]} onChange={(e) => setDay(d, [slot[0], e.target.value])} className="h-9 rounded-lg border border-input bg-card px-2" aria-label={`${DAY_LABEL[d]} end`} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Territory" description="Outline the area this broker covers. Rules with ‘use territory’ only send them leads for properties inside it.">
        <div className="mb-4">
          <Switch id="territory" checked={v.territoryOn} onCheckedChange={(on) => set({ territoryOn: on, territory: on ? v.territory : null })} label="Limit to a drawn territory" />
        </div>
        {v.territoryOn && <PolygonEditor value={v.territory} onChange={(territory) => setV((c) => ({ ...c, territory }))} center={mapCenter} />}
      </Section>

      <div className="sticky bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/90 px-4 py-3 shadow-lift backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/admin/brokers" className="text-sm text-muted-foreground hover:text-foreground">← Back to team</Link>
          {!isSelf && <Switch id="active" checked={v.active} onCheckedChange={(active) => set({ active })} label={v.active ? "Receiving leads" : "Paused"} />}
        </div>
        <Button type="submit" loading={pending}><Save className="size-4" /> {id ? "Save changes" : "Add team member"}</Button>
      </div>

      <Dialog open={Boolean(creds)} onOpenChange={() => creds && router.replace(creds.to)}>
        <DialogContent title="Share these login details" description="This password is shown only once. Ask them to change it after signing in.">
          {creds && (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted p-4 font-mono text-sm">
                <p>Email: {creds.email}</p>
                <p>Password: {creds.password}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`Email: ${creds.email}\nPassword: ${creds.password}`);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
                </Button>
                <Button onClick={() => router.replace(creds.to)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}
