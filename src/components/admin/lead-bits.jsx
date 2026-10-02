"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { LEAD_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONES = { NEW: "warning", CONTACTED: "primary", VIEWING: "primary", NEGOTIATION: "accent", WON: "success", LOST: "neutral" };

export function LeadStatusBadge({ status }) {
  return <Badge tone={TONES[status] || "neutral"}>{LEAD_STATUSES.find((s) => s.value === status)?.label || status}</Badge>;
}

export function formatDuration(seconds) {
  const abs = Math.abs(seconds);
  if (abs >= 86400) return `${Math.floor(abs / 86400)}d ${Math.floor((abs % 86400) / 3600)}h`;
  if (abs >= 3600) return `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
  return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Live SLA state: countdown while pending, "responded in" once answered. */
export function SlaCell({ lead }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    if (lead.status !== "NEW" || !lead.slaDueAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lead.status, lead.slaDueAt]);

  if (lead.firstResponseAt) {
    const mins = Math.round((new Date(lead.firstResponseAt) - new Date(lead.createdAt)) / 60000);
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5 text-success" /> {mins}m response
      </span>
    );
  }
  if (!lead.slaDueAt || now == null) return <span className="text-xs text-muted-foreground">–</span>;
  const diff = Math.round((new Date(lead.slaDueAt).getTime() - now) / 1000);
  return (
    <span className={cn("text-xs font-semibold tabular-nums", diff < 0 ? "text-danger" : diff < 600 ? "text-warning" : "text-foreground")}>
      {diff < 0 ? `Breached ${formatDuration(diff)} ago` : `${formatDuration(diff)} left`}
    </span>
  );
}
