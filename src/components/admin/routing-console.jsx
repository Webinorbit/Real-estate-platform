"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, CircleSlash, Clock, GripVertical, Pencil, Play, Plus, Route, Shuffle, Trash2, Users, X } from "lucide-react";
import { deleteRule, reorderRules, runSimulation, saveRule, toggleRule } from "@/app/admin/(panel)/routing/actions";
import { PolygonEditor } from "@/components/admin/polygon-editor";
import { TagInput } from "@/components/admin/tag-input";
import { Button } from "@/components/ui/button";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Chip, Field, Input, Select, SegmentedControl } from "@/components/ui/form";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui/misc";
import { LANGUAGES, LEAD_SOURCES, PROPERTY_TYPES, STRATEGIES } from "@/lib/constants";
import { formatDateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

const strategyLabel = (v) => STRATEGIES.find((s) => s.value === v)?.label || v;
const sourceLabel = (v) => LEAD_SOURCES.find((s) => s.value === v)?.label || v;
const typeLabel = (v) => PROPERTY_TYPES.find((t) => t.value === v)?.label || v;

export function summarize(c = {}, currency = "INR") {
  const out = [];
  if (c.listingTypes?.length) out.push(c.listingTypes.map((t) => (t === "RENT" ? "Rent" : "Sale")).join(" / "));
  if (c.propertyTypes?.length) out.push(c.propertyTypes.map(typeLabel).join(", "));
  if (c.minPrice != null || c.maxPrice != null) out.push(`${c.minPrice != null ? `≥ ${Number(c.minPrice).toLocaleString("en-IN")}` : ""}${c.minPrice != null && c.maxPrice != null ? " and " : ""}${c.maxPrice != null ? `≤ ${Number(c.maxPrice).toLocaleString("en-IN")}` : ""} ${currency}`);
  if (c.cities?.length) out.push(`City: ${c.cities.join(", ")}`);
  if (c.localities?.length) out.push(`Area: ${c.localities.join(", ")}`);
  if (c.languages?.length) out.push(`Speaks ${c.languages.join(", ")}`);
  if (c.sources?.length) out.push(c.sources.map(sourceLabel).join(", "));
  if (c.polygon) out.push("Inside drawn map area");
  return out;
}

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function blankRule() {
  return {
    name: "", enabled: true, strategy: "ROUND_ROBIN", brokerIds: [], requireAvailable: true, matchLanguage: false, useTerritory: false, slaMinutes: "",
    conditions: { listingTypes: [], propertyTypes: [], minPrice: "", maxPrice: "", cities: [], localities: [], languages: [], sources: [], polygon: null },
  };
}

function fromRule(r) {
  const c = r.conditions || {};
  return {
    name: r.name, enabled: r.enabled, strategy: r.strategy, brokerIds: r.brokerIds || [], requireAvailable: r.requireAvailable, matchLanguage: r.matchLanguage, useTerritory: r.useTerritory, slaMinutes: r.slaMinutes ?? "",
    conditions: { listingTypes: c.listingTypes || [], propertyTypes: c.propertyTypes || [], minPrice: c.minPrice ?? "", maxPrice: c.maxPrice ?? "", cities: c.cities || [], localities: c.localities || [], languages: c.languages || [], sources: c.sources || [], polygon: c.polygon || null },
  };
}

function RuleEditor({ open, onClose, rule, brokers, mapCenter, allowSla }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(() => (rule ? fromRule(rule) : blankRule()));
  const [areaOn, setAreaOn] = useState(Boolean(rule?.conditions?.polygon));
  const set = (patch) => setV((c) => ({ ...c, ...patch }));
  const cond = (patch) => setV((c) => ({ ...c, conditions: { ...c.conditions, ...patch } }));
  const c = v.conditions;

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await saveRule(rule?.id || null, v);
      if (!res.ok) return toast.error(res.error);
      toast.success(rule ? "Rule saved" : "Rule created");
      onClose();
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={rule ? "Edit routing rule" : "New routing rule"} className="w-full max-w-2xl">
      <form onSubmit={submit} className="space-y-7 p-5 pb-0">
        <Field label="Rule name"><Input required value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Luxury villas → senior advisors" autoFocus /></Field>

        <section>
          <h3 className="font-heading text-lg font-semibold">1. When a lead matches…</h3>
          <p className="mb-4 text-sm text-muted-foreground">Leave a condition empty to match everything. All filled conditions must match.</p>
          <div className="space-y-4">
            <Field label="Listing type">
              <div className="flex gap-2">
                {[["SALE", "For sale"], ["RENT", "For rent"]].map(([val, label]) => <Chip key={val} active={c.listingTypes.includes(val)} onClick={() => cond({ listingTypes: toggle(c.listingTypes, val) })}>{label}</Chip>)}
              </div>
            </Field>
            <Field label="Property type">
              <div className="flex flex-wrap gap-2">{PROPERTY_TYPES.map((t) => <Chip key={t.value} active={c.propertyTypes.includes(t.value)} onClick={() => cond({ propertyTypes: toggle(c.propertyTypes, t.value) })}>{t.label}</Chip>)}</div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum price"><Input type="number" min="0" value={c.minPrice} onChange={(e) => cond({ minPrice: e.target.value })} placeholder="No minimum" /></Field>
              <Field label="Maximum price"><Input type="number" min="0" value={c.maxPrice} onChange={(e) => cond({ maxPrice: e.target.value })} placeholder="No maximum" /></Field>
            </div>
            <Field label="Cities"><TagInput value={c.cities} onChange={(cities) => cond({ cities })} placeholder="Mumbai, Pune…" /></Field>
            <Field label="Localities"><TagInput value={c.localities} onChange={(localities) => cond({ localities })} placeholder="Bandra West, Juhu…" /></Field>
            <Field label="Lead language">
              <div className="flex flex-wrap gap-2">{LANGUAGES.slice(0, 8).map((l) => <Chip key={l} active={c.languages.includes(l)} onClick={() => cond({ languages: toggle(c.languages, l) })}>{l}</Chip>)}</div>
            </Field>
            <Field label="Lead source">
              <div className="flex flex-wrap gap-2">{LEAD_SOURCES.map((s) => <Chip key={s.value} active={c.sources.includes(s.value)} onClick={() => cond({ sources: toggle(c.sources, s.value) })}>{s.label}</Chip>)}</div>
            </Field>
            <div>
              <Switch id="area" checked={areaOn} onCheckedChange={(on) => { setAreaOn(on); if (!on) cond({ polygon: null }); }} label="Only properties inside a drawn map area" />
              {areaOn && <div className="mt-3"><PolygonEditor value={c.polygon} onChange={(polygon) => cond({ polygon })} center={mapCenter} className="h-72" /></div>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-heading text-lg font-semibold">2. …send it to</h3>
          <div className="mt-3 space-y-4">
            <Field label="Strategy" hint={STRATEGIES.find((s) => s.value === v.strategy)?.hint}>
              <div className="grid gap-2 sm:grid-cols-2">
                {STRATEGIES.map((s) => (
                  <button key={s.value} type="button" onClick={() => set({ strategy: s.value })} className={cn("rounded-xl border p-3 text-left transition", v.strategy === s.value ? "border-primary bg-primary/8 ring-2 ring-primary/25" : "border-border hover:border-foreground/30")}>
                    <span className="block text-sm font-semibold">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.hint}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`Broker pool ${v.brokerIds.length ? `(${v.brokerIds.length} selected)` : "(everyone active)"}`} hint="Pick specific brokers, or leave empty to use the whole team.">
              <div className="grid max-h-56 gap-1.5 overflow-auto rounded-xl border border-border p-2 sm:grid-cols-2">
                {brokers.map((b) => {
                  const on = v.brokerIds.includes(b.id);
                  return (
                    <button key={b.id} type="button" onClick={() => set({ brokerIds: toggle(v.brokerIds, b.id) })} aria-pressed={on} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition", on ? "bg-primary/12 text-primary" : "hover:bg-muted")}>
                      <Avatar name={b.name} src={b.photoUrl} size={26} />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      {on && <Check className="size-4" />}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Switch id="avail" checked={v.requireAvailable} onCheckedChange={(requireAvailable) => set({ requireAvailable })} label="Only on-shift brokers" />
              <Switch id="lang" checked={v.matchLanguage} onCheckedChange={(matchLanguage) => set({ matchLanguage })} label="Match lead language" />
              <Switch id="terr" checked={v.useTerritory} onCheckedChange={(useTerritory) => set({ useTerritory })} label="Respect territory" />
            </div>
            {allowSla && <Field label="First-response SLA override (minutes)" hint="Empty uses the account default."><Input type="number" min="1" max="1440" value={v.slaMinutes} onChange={(e) => set({ slaMinutes: e.target.value })} /></Field>}
          </div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-5 flex justify-end gap-2 border-t border-border bg-card/95 px-5 py-4 backdrop-blur">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>{rule ? "Save rule" : "Create rule"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function RuleCard({ rule, index, brokersById, currency, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  const [pending, start] = useTransition();
  const router = useRouter();
  const chips = summarize(rule.conditions, currency);
  const pool = rule.brokerIds.map((id) => brokersById[id]).filter(Boolean);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10")}>
      <Card className={cn("flex items-stretch gap-3 p-3 sm:p-4", !rule.enabled && "opacity-60", isDragging && "shadow-lift ring-2 ring-primary")}>
        <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${rule.name}`} className="grid w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <GripVertical className="size-5" />
        </button>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">{index + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{rule.name}</h3>
            <Badge tone="primary"><Shuffle className="size-3" /> {strategyLabel(rule.strategy)}</Badge>
            {rule.matchLanguage && <Badge>Language match</Badge>}
            {rule.useTerritory && <Badge>Territory</Badge>}
            {rule.slaMinutes && <Badge tone="accent"><Clock className="size-3" /> {rule.slaMinutes}m SLA</Badge>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">If</span>
            {chips.length ? chips.map((c) => <span key={c} className="rounded-md bg-muted px-2 py-0.5">{c}</span>) : <span className="rounded-md bg-muted px-2 py-0.5">any lead</span>}
            <ArrowRight className="size-3.5" />
            {pool.length ? (
              <span className="flex -space-x-1.5">{pool.slice(0, 6).map((b) => <Avatar key={b.id} name={b.name} src={b.photoUrl} size={22} className="ring-2 ring-card" />)}{pool.length > 6 && <span className="grid size-[22px] place-items-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card">+{pool.length - 6}</span>}</span>
            ) : (
              <span className="flex items-center gap-1"><Users className="size-3.5" /> whole team</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id={`rule-${rule.id}`} hideLabel label={`${rule.enabled ? "Disable" : "Enable"} rule ${rule.name}`} checked={rule.enabled} disabled={pending} onCheckedChange={(on) => start(async () => { const r = await toggleRule(rule.id, on); if (!r.ok) toast.error(r.error); else router.refresh(); })} />
          <button type="button" onClick={onEdit} aria-label={`Edit ${rule.name}`} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary"><Pencil className="size-4" /></button>
          <button type="button" onClick={onDelete} aria-label={`Delete ${rule.name}`} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-danger hover:text-danger"><Trash2 className="size-4" /></button>
        </div>
      </Card>
    </li>
  );
}

function RulesTab({ rules: initial, brokers, mapCenter, currency, allowSla }) {
  const router = useRouter();
  const dndId = useId();
  const [rules, setRules] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const brokersById = useMemo(() => Object.fromEntries(brokers.map((b) => [b.id, b])), [brokers]);

  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRules(initial);
  }

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(rules, rules.findIndex((r) => r.id === active.id), rules.findIndex((r) => r.id === over.id));
    setRules(next);
    const res = await reorderRules(next.map((r) => r.id));
    if (!res.ok) {
      toast.error(res.error);
      setRules(rules);
    } else {
      toast.success("Priority updated");
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Rules run top to bottom. The first rule with an eligible broker wins. Drag to change priority.</p>
        <Button onClick={() => setEditing("new")}><Plus className="size-4" /> New rule</Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState icon={Route} title="No rules yet" description="Without rules, leads go to the default pool: available brokers with spare capacity, round robin." action={<Button onClick={() => setEditing("new")}>Create your first rule</Button>} />
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {rules.map((r, i) => <RuleCard key={r.id} rule={r} index={i} brokersById={brokersById} currency={currency} onEdit={() => setEditing(r)} onDelete={() => setRemoving(r)} />)}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <Card className="border-dashed bg-muted/40 p-4 text-sm">
        <p className="font-semibold">Then, the default pool</p>
        <p className="mt-1 text-muted-foreground">If no rule produces an eligible broker, the lead goes to available brokers with spare capacity, then on-call brokers, then the least-loaded broker. Nothing is ever silently dropped. If there are no active brokers, the lead escalates to the owner.</p>
      </Card>

      {editing && <RuleEditor key={editing === "new" ? "new" : editing.id} open rule={editing === "new" ? null : editing} brokers={brokers} mapCenter={mapCenter} allowSla={allowSla} onClose={() => setEditing(null)} />}

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent title={`Delete “${removing?.name}”?`} description="Leads already routed keep their history. New leads will skip this rule.">
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={pending} onClick={() => start(async () => { const res = await deleteRule(removing.id); if (res.ok) { setRules((rs) => rs.filter((r) => r.id !== removing.id)); setRemoving(null); toast.success("Rule deleted"); router.refresh(); } else toast.error(res.error); })}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const outcomeStyle = {
  selected: { icon: Check, tone: "text-success", label: "Selected" },
  skipped: { icon: CircleSlash, tone: "text-muted-foreground", label: "Skipped" },
  "no-eligible-broker": { icon: AlertTriangle, tone: "text-warning", label: "No eligible broker" },
};

function SimulatorTab({ properties }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ propertyId: properties[0]?.id || "", source: "ENQUIRY", language: "", budget: "", now: "" });
  const [result, setResult] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const run = (e) => {
    e?.preventDefault();
    start(async () => {
      const res = await runSimulation({ ...form, now: form.now ? new Date(form.now).toISOString() : null });
      if (res.ok) setResult(res.result);
      else toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit p-5">
        <h3 className="font-heading text-lg font-semibold">Test a lead</h3>
        <p className="mb-4 text-sm text-muted-foreground">A dry run through your live rules. Nothing is saved or sent.</p>
        <form onSubmit={run} className="space-y-4">
          <Field label="Property">
            <Select value={form.propertyId} onChange={(e) => set({ propertyId: e.target.value })}>
              <option value="">No property (general enquiry)</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </Field>
          <Field label="Lead source"><Select value={form.source} onChange={(e) => set({ source: e.target.value })}>{LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          <Field label="Lead language"><Select value={form.language} onChange={(e) => set({ language: e.target.value })}><option value="">Not specified</option>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</Select></Field>
          <Field label="Budget (optional)"><Input type="number" min="0" value={form.budget} onChange={(e) => set({ budget: e.target.value })} /></Field>
          <Field label="Pretend it is…" hint="Test after-hours behaviour. Empty means right now."><Input type="datetime-local" value={form.now} onChange={(e) => set({ now: e.target.value })} /></Field>
          <Button type="submit" loading={pending} className="w-full"><Play className="size-4" /> Run simulation</Button>
        </form>
      </Card>

      <div>
        {!result ? (
          <EmptyState icon={Route} title="Run a test to see the decision" description="You will see which rules matched, which brokers were eligible, and exactly why one was chosen." />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={JSON.stringify(result.trace) + result.brokerId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <Card className={cn("flex items-center gap-4 p-5", result.unassigned ? "border-danger/50" : "border-primary/40")}>
                {result.broker ? <Avatar name={result.broker.name} src={result.broker.photoUrl} size={56} /> : <div className="grid size-14 place-items-center rounded-full bg-danger/15 text-danger"><AlertTriangle className="size-6" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Routed to</p>
                  <p className="font-heading text-2xl font-semibold">{result.broker?.name || "Nobody. Escalated to owner"}</p>
                  <p className="text-sm text-muted-foreground">{result.rule ? `via “${result.rule.name}”` : "via default pool"}{result.strategy && ` · ${strategyLabel(result.strategy)}`} · SLA {result.slaMinutes} min</p>
                </div>
              </Card>

              <Card className="p-5">
                <h4 className="mb-2 font-semibold">Why</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">{result.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              </Card>

              <Card className="p-5">
                <h4 className="mb-3 font-semibold">Rule evaluation</h4>
                <ol className="space-y-2.5">
                  {result.trace.map((t, i) => {
                    const o = outcomeStyle[t.outcome] || outcomeStyle.skipped;
                    const Icon = o.icon;
                    return (
                      <li key={`${t.ruleId}-${i}`} className="flex gap-3 text-sm">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", o.tone)} />
                        <div><p className="font-medium">{t.ruleName} <span className={cn("text-xs font-normal", o.tone)}>· {o.label}</span></p><p className="text-xs text-muted-foreground">{t.detail}</p></div>
                      </li>
                    );
                  })}
                  {result.fallback && <li className="flex gap-3 text-sm"><Route className="mt-0.5 size-4 shrink-0 text-primary" /><p className="font-medium">Default pool <span className="text-xs font-normal text-primary">· Used</span></p></li>}
                </ol>
              </Card>

              <Card className="overflow-hidden">
                <h4 className="p-5 pb-3 font-semibold">Broker eligibility</h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <tbody className="divide-y divide-border">
                      {result.candidates.map((c) => (
                        <tr key={c.brokerId} className={cn(c.brokerId === result.brokerId && "bg-primary/8")}>
                          <td className="px-5 py-2.5 font-medium">{c.name}{c.brokerId === result.brokerId && <Badge tone="primary" className="ml-2">Chosen</Badge>}</td>
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{c.load}/{c.capacity}</td>
                          <td className="px-5 py-2.5 text-right">{c.eligible ? <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" /> Eligible</span> : <span className="inline-flex items-center gap-1 text-muted-foreground"><X className="size-3.5" /> {c.why}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function AuditTab({ entries, locale }) {
  if (!entries.length) return <EmptyState icon={Route} title="No routing decisions yet" description="Every assignment, reassignment and escalation is recorded here with its reasoning." />;
  const kindTone = { INITIAL: "primary", REASSIGN: "warning", ESCALATE: "danger", MANUAL: "neutral" };
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-5 py-3 font-semibold">When</th><th className="px-3 py-3 font-semibold">Lead</th><th className="px-3 py-3 font-semibold">Event</th><th className="px-3 py-3 font-semibold">Assigned to</th><th className="px-3 py-3 font-semibold">Rule</th><th className="px-5 py-3 font-semibold">Reasoning</th></tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDateTime(e.createdAt, locale)}</td>
                <td className="px-3 py-3 font-medium"><a href={`/admin/leads/${e.leadId}`} className="hover:text-primary">{e.leadName}</a></td>
                <td className="px-3 py-3"><Badge tone={kindTone[e.kind] || "neutral"}>{titleCase(e.kind)}</Badge></td>
                <td className="px-3 py-3">{e.brokerName || <Badge tone="danger">Unassigned</Badge>}</td>
                <td className="px-3 py-3 text-muted-foreground">{e.ruleName || "—"}{e.strategy && <span className="block text-xs">{strategyLabel(e.strategy)}</span>}</td>
                <td className="max-w-md px-5 py-3 text-xs text-muted-foreground">{(e.reasons || []).join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RoutingConsole({ rules, brokers, properties, audit, mapCenter, currency, locale, allowSla }) {
  return (
    <Tabs defaultValue="rules">
      <TabsList className="mb-5">
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="simulator">Simulator</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>
      <TabsContent value="rules"><RulesTab rules={rules} brokers={brokers} mapCenter={mapCenter} currency={currency} allowSla={allowSla} /></TabsContent>
      <TabsContent value="simulator"><SimulatorTab properties={properties} /></TabsContent>
      <TabsContent value="audit"><AuditTab entries={audit} locale={locale} /></TabsContent>
    </Tabs>
  );
}
