"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";

const PARTS = [
  ["listings", "Listings and virtual tours", "Every property with its photos, 360° tours, favourites and saved searches."],
  ["leads", "Leads and pipeline", "Every enquiry with its timeline and assignment history."],
  ["team", "Team members", "Everyone except account owners and you, plus routing rules."],
];

/** "Delete all data" for owners / WebInOrbit admins: wipes listings, leads and team so a fresh setup can be imported. */
export function DangerZone({ tenantName }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState({ listings: true, leads: true, team: true });
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = confirm.trim().toLowerCase() === tenantName.trim().toLowerCase();
  const any = Object.values(parts).some(Boolean);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/data/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm, ...parts }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(body.error || "Could not delete the data");
      const d = body.deleted;
      toast.success("Data deleted", {
        description: [d.listings && `${d.listings} listings`, d.tours && `${d.tours} tours`, d.leads && `${d.leads} leads`, d.team && `${d.team} team members`].filter(Boolean).join(", ") || "Nothing was left to delete.",
      });
      setOpen(false);
      setConfirm("");
      router.refresh();
    } catch {
      toast.error("Could not delete the data. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border-danger/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-danger/10 text-danger"><AlertTriangle className="size-5" /></span>
            <div>
              <h2 className="font-heading text-xl font-semibold">Danger zone</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Delete all listings, tours, leads and team members to start fresh, for example before importing a new setup zip. Branding, settings and your login stay.
              </p>
            </div>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            <Trash2 className="size-4" /> Delete all data
          </Button>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent title="Delete all data?" description="This permanently deletes what you tick below. It cannot be undone.">
          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border p-4">
              {PARTS.map(([key, label, hint]) => (
                <div key={key}>
                  <Checkbox checked={parts[key]} onChange={(v) => setParts((p) => ({ ...p, [key]: v }))} label={<span className="font-medium">{label}</span>} />
                  <p className="ml-7 mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
            <Field label={<>Type <span className="font-semibold">{tenantName}</span> to confirm</>} htmlFor="reset-confirm">
              <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder={tenantName} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={run} disabled={!matches || !any} loading={busy}>
                <Trash2 className="size-4" /> Delete permanently
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
