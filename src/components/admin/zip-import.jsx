"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, CheckCircle2, Download, FileArchive, KeyRound, Loader2, Palette, Sparkles, UploadCloud, Users } from "lucide-react";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const STEP_LABEL = {
  reading: "Reading the zip…",
  branding: "Saving branding…",
  team: "Adding team members…",
  listings: "Importing listings…",
  done: "Finishing…",
};

/** Turns a failed response into a message people can act on (proxies answer with HTML, not our JSON). */
async function errorOf(res) {
  const body = await res.json().catch(() => null);
  if (body?.error) return body.error;
  if (res.status === 413) return "The server refused a file this large. Ask your host to raise the upload limit.";
  if (res.status === 502 || res.status === 504) return "The server took too long to answer. Please try again.";
  return `Import failed (error ${res.status}). Please try again.`;
}

const call = (url, init) => fetch(url, { cache: "no-store", ...init });

/**
 * Sends the zip in chunks (web servers cap request size), then starts the import in the background and polls
 * its progress, so big setups never hit upload-size or time limits.
 */
async function uploadAndImport(file, onState) {
  const start = await call("/api/admin/import/zip/start", { method: "POST" });
  if (!start.ok) throw new Error(await errorOf(start));
  const { uploadId, chunkBytes } = await start.json();

  for (let sent = 0; sent < file.size; sent += chunkBytes) {
    const form = new FormData();
    form.append("chunk", file.slice(sent, sent + chunkBytes), "chunk");
    const res = await call(`/api/admin/import/zip/${uploadId}/chunk`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await errorOf(res));
    onState({ phase: "upload", progress: Math.min(1, (sent + chunkBytes) / file.size) });
  }

  const finish = await call(`/api/admin/import/zip/${uploadId}/finish`, { method: "POST" });
  if (!finish.ok) throw new Error(await errorOf(finish));

  for (let misses = 0; ; ) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await call(`/api/admin/import/zip/${uploadId}/status`).catch(() => null);
    if (!res?.ok) {
      // A brief network blip or server restart: keep trying for a while before giving up.
      if (++misses > 20) throw new Error(res ? await errorOf(res) : "Lost contact with the server. Check the listings page; the import may still have finished.");
      continue;
    }
    misses = 0;
    const job = await res.json();
    if (job.status === "done") return job.result;
    if (job.status === "error") throw new Error(job.error || "Import failed. Please try again.");
    onState({ phase: "process", step: job.step, done: job.done, total: job.total });
  }
}

export function ZipImport({ isSuper }) {
  const router = useRouter();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [state, setState] = useState(null); // {phase: "upload", progress} | {phase: "process", step, done, total} | {phase: "done", result}

  const start = async (file) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return toast.error("Please choose a .zip file");
    setState({ phase: "upload", progress: 0, name: file.name });
    try {
      const result = await uploadAndImport(file, (next) => setState((s) => ({ ...s, ...next })));
      setState({ phase: "done", result });
      toast.success("Import finished");
      router.refresh();
    } catch (err) {
      setState(null);
      toast.error(err.message || "Import failed. Please try again.", { duration: 10000 });
    }
  };

  if (state?.phase === "done") return <ZipResult result={state.result} onAgain={() => setState(null)} />;

  const busy = state?.phase === "upload" || state?.phase === "process";
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
        <div className="flex gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><FileArchive className="size-6" /></span>
          <div>
            <h2 className="font-heading text-xl font-semibold">Import a full setup (.zip)</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              One upload sets up the whole site: branding, team members with photos, listings with their photos and 360° virtual tours.
              {isSuper && " As a WebInOrbit admin, a \"plan\" in settings.json also upgrades this client."}
            </p>
          </div>
        </div>
        <a href="/api/admin/import/zip-template" download className={buttonClasses({ variant: "outline", size: "sm" })}>
          <Download className="size-4" /> Download template
        </a>
      </div>

      <div className="p-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            start(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
            over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
            busy && "pointer-events-none",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="mt-3 font-semibold">
                {state.phase === "upload" ? `Uploading ${state.name}…` : state.step === "listings" && state.total ? `Importing listings ${Math.min(state.done + 1, state.total)} of ${state.total}…` : STEP_LABEL[state.step] || "Setting everything up…"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.phase === "upload" ? `${Math.round(state.progress * 100)}% uploaded` : "Photos and 360° tours are being processed. You can keep this tab open; big setups take a few minutes."}
              </p>
              <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((state.phase === "upload" ? state.progress : state.total ? state.done / state.total : 0.05) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <UploadCloud className="size-8 text-primary" />
              <p className="mt-3 font-semibold">Drop your .zip here or click to choose</p>
              <p className="mt-1 text-sm text-muted-foreground">settings.json · team.csv · properties.csv · photos/ · tours/ · hero/ · logo.png (all optional)</p>
            </>
          )}
        </button>
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => start(e.target.files?.[0])} />
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, sub, tone = "primary" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn("size-4", tone === "warn" ? "text-warning" : "text-primary")} /> {label}
      </div>
      <p className="mt-2 font-heading text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ZipResult({ result, onAgain }) {
  const { plan, settings, team, properties, warnings = [] } = result;
  const problems = [
    ...(settings?.error ? [{ where: "Branding", text: settings.error }] : []),
    ...(team?.skipped || []).map((s) => ({ where: `team.csv row ${s.row} (${s.name})`, text: s.error })),
    ...(properties?.failed || []).map((f) => ({ where: `properties.csv row ${f.row}${f.title ? ` (${f.title})` : ""}`, text: f.error })),
    ...warnings.map((w) => ({ where: "Note", text: w })),
  ];
  return (
    <Card className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="size-6" /></span>
        <div>
          <h2 className="font-heading text-xl font-semibold">Import finished</h2>
          <p className="text-sm text-muted-foreground">Here is everything that was set up from your zip.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Sparkles} label="Plan" value={plan ? plan.plan.charAt(0) + plan.plan.slice(1).toLowerCase() : "Unchanged"} sub={plan?.changed ? "Upgraded" : undefined} />
        <Stat icon={Palette} label="Branding" value={settings ? (settings.updated ? "Updated" : "Not saved") : "—"} sub={settings?.updated ? [settings.logo && "logo", settings.heroImages && `${settings.heroImages} banner photos`].filter(Boolean).join(" · ") || undefined : undefined} tone={settings?.error ? "warn" : "primary"} />
        <Stat icon={Users} label="Team members" value={team ? team.created : "—"} sub={team?.skipped?.length ? `${team.skipped.length} skipped` : undefined} tone={team?.skipped?.length ? "warn" : "primary"} />
        <Stat icon={Building2} label="Listings" value={properties ? properties.created : "—"} sub={properties ? [`${properties.photos} photos`, properties.tours ? `${properties.tours} tours (${properties.scenes} rooms)` : null, properties.failed.length ? `${properties.failed.length} skipped` : null].filter(Boolean).join(" · ") : undefined} tone={properties?.failed?.length ? "warn" : "primary"} />
      </div>

      {team?.logins?.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-warning" /> Temporary passwords (shown only once, copy them now)</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {team.logins.map((l) => (
                  <tr key={l.email} className="border-t border-warning/20">
                    <td className="py-2 pr-4 font-medium">{l.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{l.email}</td>
                    <td className="py-2 font-mono">{l.tempPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-2xl border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-warning" /> {problems.length} item{problems.length > 1 ? "s" : ""} need attention</p>
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-sm">
            {problems.map((p, i) => (
              <li key={i}><span className="font-medium">{p.where}:</span> <span className="text-muted-foreground">{p.text}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/admin/properties">View listings</ButtonLink>
        <ButtonLink href="/admin/brokers" variant="outline">View team</ButtonLink>
        <Button variant="ghost" onClick={onAgain}>Import another zip</Button>
        <Link href="/" target="_blank" className="ml-auto self-center text-sm font-medium text-primary hover:underline">Open public site →</Link>
      </div>
    </Card>
  );
}
