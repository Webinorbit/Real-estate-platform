"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Pencil, Star, Trash2 } from "lucide-react";
import { deleteProperty, setPropertyStatus, toggleFeatured } from "@/app/admin/(panel)/properties/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PROPERTY_STATUSES } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PropertyRowActions({ id, slug, status, featured, title }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const run = (fn, ok) =>
    start(async () => {
      const res = await fn();
      if (res.ok) ok && toast.success(ok);
      else toast.error(res.error);
    });

  return (
    <div className="flex items-center justify-end gap-1.5">
      <select
        aria-label={`Status for ${title}`}
        value={status}
        disabled={pending}
        onChange={(e) => run(() => setPropertyStatus(id, e.target.value), "Status updated")}
        className="h-8 rounded-lg border border-input bg-card px-2 text-xs font-medium"
      >
        {PROPERTY_STATUSES.map((s) => (
          <option key={s} value={s}>{titleCase(s)}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => toggleFeatured(id, !featured), featured ? "Removed from featured" : "Marked as featured")}
        aria-label={featured ? "Remove from featured" : "Mark as featured"}
        aria-pressed={featured}
        className={cn("grid size-8 place-items-center rounded-lg border transition", featured ? "border-accent bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground")}
      >
        <Star className={cn("size-4", featured && "fill-current")} />
      </button>
      <Link href={`/properties/${slug}`} target="_blank" aria-label="View on site" className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
        <ExternalLink className="size-4" />
      </Link>
      <Link href={`/admin/properties/${id}`} aria-label="Edit property" className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary">
        <Pencil className="size-4" />
      </Link>
      <button type="button" onClick={() => setConfirm(true)} aria-label="Delete property" className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:border-danger hover:text-danger">
        <Trash2 className="size-4" />
      </button>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Delete this listing?" description={`"${title}" and its tours and favourites will be removed permanently. Existing leads are kept.`}>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteProperty(id);
                  if (res.ok) {
                    toast.success("Listing deleted");
                    setConfirm(false);
                  } else toast.error(res.error);
                })
              }
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
