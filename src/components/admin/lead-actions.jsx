"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { addNote, reassignLead, updateLeadStatus } from "@/app/admin/(panel)/leads/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { LEAD_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function LeadActions({ lead, brokers, isStaff }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [askLost, setAskLost] = useState(false);
  const [brokerId, setBrokerId] = useState(lead.brokerId || "");

  const run = (fn, ok) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error);
      toast.success(ok);
      router.refresh();
    });

  const setStatus = (status) => {
    if (status === "LOST" && !askLost) return setAskLost(true);
    setAskLost(false);
    run(() => updateLeadStatus(lead.id, status, lostReason), `Moved to ${status.toLowerCase()}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move to stage</p>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending}
              onClick={() => setStatus(s.value)}
              className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-95 disabled:opacity-60", lead.status === s.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground/40")}
            >
              {s.label}
            </button>
          ))}
        </div>
        {askLost && (
          <div className="mt-3 flex gap-2">
            <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)} aria-label="Reason lost">
              <option value="">Reason (optional)</option>
              {["Bought elsewhere", "Budget mismatch", "No response", "Changed plans", "Not serious"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <Button variant="danger" onClick={() => setStatus("LOST")} loading={pending}>Mark lost</Button>
          </div>
        )}
      </div>

      {isStaff && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reassign manually</p>
          <div className="flex gap-2">
            <Select value={brokerId} onChange={(e) => setBrokerId(e.target.value)} aria-label="Broker">
              <option value="">Choose broker</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Button variant="outline" disabled={!brokerId || brokerId === lead.brokerId} loading={pending} onClick={() => run(() => reassignLead(lead.id, brokerId), "Lead reassigned")}>
              <UserRoundCog className="size-4" /> Assign
            </Button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await addNote(lead.id, note);
            if (res.ok) setNote("");
            return res;
          }, "Note added");
        }}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a note</p>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called back, wants a Saturday viewing…" />
        <Button type="submit" className="mt-2" loading={pending} disabled={!note.trim()}>
          <Send className="size-4" /> Save note
        </Button>
      </form>
    </div>
  );
}
