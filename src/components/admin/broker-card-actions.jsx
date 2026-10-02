"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { deleteBroker, setBrokerActive } from "@/app/admin/(panel)/brokers/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function BrokerCardActions({ id, name, active, openLeads, self }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
      <Switch
        id={`active-${id}`}
        checked={active}
        disabled={pending}
        label={active ? "Receiving leads" : "Paused"}
        onCheckedChange={(v) =>
          start(async () => {
            const res = await setBrokerActive(id, v);
            if (res.ok) toast.success(v ? `${name} will receive leads again` : `${name} is paused. No new leads will be routed.`);
            else toast.error(res.error);
          })
        }
      />
      <div className="flex items-center gap-1.5">
        <Link href={`/admin/brokers/${id}`} aria-label={`Edit ${name}`} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary">
          <Pencil className="size-4" />
        </Link>
        {!self && (
          <button type="button" aria-label={`Remove ${name}`} onClick={() => setConfirm(true)} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-danger hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={`Remove ${name}?`} description={openLeads > 0 ? `${openLeads} open lead${openLeads > 1 ? "s" : ""} will become unassigned. Consider pausing instead.` : "Their login will be removed. Past leads keep their history."}>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteBroker(id);
                  if (res.ok) {
                    toast.success(`${name} removed`);
                    setConfirm(false);
                  } else toast.error(res.error);
                })
              }
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
