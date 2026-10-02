"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import { updateLeadStatus } from "@/app/admin/(panel)/leads/actions";
import { SlaCell } from "@/components/admin/lead-bits";
import { Avatar } from "@/components/ui/misc";
import { LEAD_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const DOT = { NEW: "bg-warning", CONTACTED: "bg-sky-400", VIEWING: "bg-violet-500", NEGOTIATION: "bg-pink-500", WON: "bg-success", LOST: "bg-muted-foreground" };

function CardBody({ lead, dragging }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3.5 shadow-soft", dragging && "rotate-2 shadow-lift ring-2 ring-primary/40")}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{lead.name}</p>
          <p className="truncate text-xs text-muted-foreground">{lead.property || "General enquiry"}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {lead.brokerName ? <Avatar name={lead.brokerName} src={lead.brokerPhoto} size={20} /> : null}
          <span className="truncate">{lead.brokerName || "Unassigned"}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(lead.createdAt)}</span>
      </div>
      {lead.status === "NEW" && <div className="mt-2"><SlaCell lead={lead} /></div>}
    </div>
  );
}

function DraggableLead({ lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { status: lead.status } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl", isDragging && "opacity-30")}>
      <Link href={`/admin/leads/${lead.id}`} draggable={false} onClick={(e) => isDragging && e.preventDefault()} className="block cursor-grab active:cursor-grabbing">
        <CardBody lead={lead} />
      </Link>
    </div>
  );
}

function Column({ status, label, leads }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} column`}
      className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/50 transition-colors", isOver ? "border-primary bg-primary/8" : "border-border")}
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <i className={cn("size-2.5 rounded-full", DOT[status])} />
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">{leads.length}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-16rem)] min-h-24 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {leads.map((l) => (
          <DraggableLead key={l.id} lead={l} />
        ))}
        {leads.length === 0 && <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Drop leads here</p>}
      </div>
    </section>
  );
}

export function PipelineBoard({ initialLeads }) {
  const [leads, setLeads] = useState(initialLeads);
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = useCallback(
    async ({ active, over }) => {
      setActiveId(null);
      if (!over) return;
      const lead = leads.find((l) => l.id === active.id);
      const status = over.id;
      if (!lead || lead.status === status) return;
      const previous = leads;
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status, firstResponseAt: status !== "NEW" ? new Date().toISOString() : l.firstResponseAt } : l)));
      const res = await updateLeadStatus(lead.id, status);
      if (!res.ok) {
        setLeads(previous);
        toast.error(res.error);
      } else {
        toast.success(`${lead.name} moved to ${LEAD_STATUSES.find((s) => s.value === status).label}`);
      }
    },
    [leads],
  );

  const active = leads.find((l) => l.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => setActiveId(active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {LEAD_STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} leads={leads.filter((l) => l.status === s.value)} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 200 }}>{active ? <CardBody lead={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
