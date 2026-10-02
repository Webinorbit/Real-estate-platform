"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { importBatch } from "@/app/admin/(panel)/import/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { autoMap, buildRow, checkRow, IMPORT_FIELDS, TEMPLATE_CSV } from "@/lib/import";
import { cn } from "@/lib/utils";

const STEPS = ["Upload", "Match columns", "Review & import"];

export function ImportWizard({ remaining }) {
  const input = useRef(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [data, setData] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({});
  const [over, setOver] = useState(false);
  const [run, setRun] = useState(null);

  const built = useMemo(() => data.rows.map((r) => buildRow(r, mapping)), [data.rows, mapping]);
  const checks = useMemo(() => built.map((b) => checkRow(b)), [built]);
  const valid = checks.filter((c) => c.ok).length;
  const geocodeCount = checks.filter((c) => c.ok && c.needsGeocode).length;
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]);

  const load = (f) => {
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) return toast.error("Please choose a .csv file");
    Papa.parse(f, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const headers = (res.meta.fields || []).filter(Boolean);
        if (!headers.length || !res.data.length) return toast.error("That file looks empty");
        if (res.data.length > 2000) return toast.error("Please split files into 2,000 rows or fewer");
        setFile(f);
        setData({ headers, rows: res.data });
        setMapping(autoMap(headers));
        setStep(1);
      },
      error: () => toast.error("Could not read that file"),
    });
  };

  const start = async () => {
    const todo = built.map((b, i) => ({ ...b, __index: i })).filter((_, i) => checks[i].ok);
    const outcome = { done: 0, total: todo.length, created: 0, errors: checks.map((c, i) => (c.ok ? null : { index: i, error: c.error })).filter(Boolean), running: true };
    setRun({ ...outcome });
    for (let i = 0; i < todo.length; i += 5) {
      const res = await importBatch(todo.slice(i, i + 5));
      if (!res.ok) {
        outcome.errors.push({ index: todo[i].__index, error: res.error });
        outcome.done += todo.slice(i, i + 5).length;
      } else {
        for (const r of res.results) {
          outcome.done++;
          if (r.ok) outcome.created++;
          else outcome.errors.push({ index: r.index, error: r.error });
        }
      }
      setRun({ ...outcome });
    }
    setRun({ ...outcome, running: false });
    toast.success(`${outcome.created} propert${outcome.created === 1 ? "y" : "ies"} imported`);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "properties-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
            <span className={cn("font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="p-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              load(e.dataTransfer.files[0]);
            }}
            className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-12 text-center transition", over ? "border-primary bg-primary/8" : "border-input bg-muted/40 hover:border-primary/60")}
          >
            <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
            <UploadCloud className="size-9 text-primary" />
            <p className="font-medium">Drop your CSV here or click to browse</p>
            <p className="text-xs text-muted-foreground">Up to 2,000 rows. {Number.isFinite(remaining) ? `You can add ${remaining} more listings on your plan.` : "Unlimited listings on your plan."}</p>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>Columns are matched automatically. Rows without coordinates are located from the address.</p>
            <Button variant="outline" size="sm" onClick={download}><Download className="size-4" /> Download template</Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <FileSpreadsheet className="size-8 text-primary" />
            <div>
              <p className="font-semibold">{file?.name}</p>
              <p className="text-sm text-muted-foreground">{data.rows.length} rows · {data.headers.length} columns</p>
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-[8.5rem_1fr] items-center gap-3">
                <label htmlFor={`map-${f.key}`} className="text-sm font-medium">{f.label}{f.required && <span className="text-danger"> *</span>}</label>
                <Select id={`map-${f.key}`} value={mapping[f.key] || ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))} className="h-10">
                  <option value="">Skip</option>
                  {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && <p className="mt-4 flex items-center gap-2 text-sm text-danger"><AlertTriangle className="size-4" /> Match: {missingRequired.map((f) => f.label).join(", ")}</p>}
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button disabled={missingRequired.length > 0} onClick={() => setStep(2)}>Review rows</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6">
          {!run ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 className="size-4" /> {valid} ready to import</p>
                {data.rows.length - valid > 0 && <p className="flex items-center gap-1.5 text-sm font-medium text-danger"><AlertTriangle className="size-4" /> {data.rows.length - valid} with problems (skipped)</p>}
                {geocodeCount > 0 && <p className="text-sm text-muted-foreground">{geocodeCount} will be located from their address (about {Math.ceil(geocodeCount * 1.2)}s)</p>}
              </div>
              <div className="max-h-96 overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Check</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {built.slice(0, 200).map((b, i) => (
                      <tr key={i} className={checks[i].ok ? "" : "bg-danger/5"}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2 font-medium">{b.title || "—"}</td>
                        <td className="px-3 py-2">{b.price || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{[b.locality, b.city].filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-3 py-2">{checks[i].ok ? <span className="text-success">OK{checks[i].needsGeocode && " · will geocode"}</span> : <span className="text-danger">{checks[i].error}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {built.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 rows. All rows are validated.</p>}
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button disabled={valid === 0} onClick={start}>Import {valid} propert{valid === 1 ? "y" : "ies"}</Button>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              {run.running ? <Loader2 className="mx-auto size-9 animate-spin text-primary" /> : <CheckCircle2 className="mx-auto size-10 text-success" />}
              <p className="mt-3 font-heading text-2xl font-semibold">{run.running ? "Importing…" : `${run.created} listings imported`}</p>
              <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 100}%` }} /></div>
              <p className="mt-2 text-sm text-muted-foreground">{run.done} of {run.total} processed{run.errors.length > 0 && ` · ${run.errors.length} skipped`}</p>
              {!run.running && run.errors.length > 0 && (
                <ul className="mx-auto mt-5 max-h-48 max-w-xl space-y-1 overflow-auto rounded-xl bg-danger/5 p-3 text-left text-xs text-danger">
                  {run.errors.sort((a, b) => a.index - b.index).map((e) => <li key={`${e.index}-${e.error}`}>Row {e.index + 1}: {e.error}</li>)}
                </ul>
              )}
              {!run.running && (
                <div className="mt-6 flex justify-center gap-2">
                  <ButtonLink href="/admin/properties">View properties</ButtonLink>
                  <Button variant="outline" onClick={() => { setRun(null); setStep(0); setFile(null); }}>Import another file</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
