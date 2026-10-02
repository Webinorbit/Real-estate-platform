"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createTour } from "@/app/admin/(panel)/tours/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, SegmentedControl, Select } from "@/components/ui/form";

export function NewTourDialog({ properties, defaultPropertyId, defaultOpen }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [pending, start] = useTransition();
  const [propertyId, setPropertyId] = useState(defaultPropertyId || properties[0]?.id || "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("PANORAMA");

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!properties.length}><Plus className="size-4" /> New tour</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Create a virtual tour" description="Start with a property, then upload 360° photos or link an external tour.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createTour({ propertyId, title, kind });
                if (!res.ok) return toast.error(res.error);
                router.push(`/admin/tours/${res.id}`);
              });
            }}
          >
            <Field label="Property">
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
            <Field label="Tour title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Walk-through of the apartment" /></Field>
            <Field label="Tour type" hint={kind === "PANORAMA" ? "Upload equirectangular 360° photos and connect rooms with arrows." : "Embed a Matterport, Kuula or other hosted tour."}>
              <SegmentedControl value={kind} onChange={setKind} options={[{ value: "PANORAMA", label: "360° photos" }, { value: "EXTERNAL", label: "External link" }]} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loading={pending}>Create tour</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
