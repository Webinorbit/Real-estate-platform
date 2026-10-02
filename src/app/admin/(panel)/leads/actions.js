"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { action, adminContext } from "@/lib/admin";

const leadPath = (id) => `/api/admin/leads/${encodeURIComponent(String(id ?? ""))}`;

export const updateLeadStatus = action(async (leadId, status, lostReason) => {
  await api(`${leadPath(leadId)}/status`, { method: "POST", body: { status, lostReason: lostReason || undefined } });
  revalidatePath("/admin", "layout");
});

export const addNote = action(async (leadId, note) => {
  await api(`${leadPath(leadId)}/notes`, { method: "POST", body: { note } });
  revalidatePath(`/admin/leads/${leadId}`);
});

export const reassignLead = action(async (leadId, brokerId) => {
  await adminContext({ staffOnly: true });
  await api(`${leadPath(leadId)}/assign`, { method: "POST", body: { brokerId } });
  revalidatePath("/admin", "layout");
});
