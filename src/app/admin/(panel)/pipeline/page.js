import { adminContext } from "@/lib/admin";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/misc";
import { PipelineBoard } from "@/components/admin/pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  await adminContext();
  const { leads: rows } = await api("/api/admin/pipeline");
  const leads = rows.map((l) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    slaDueAt: l.slaDueAt?.toISOString() || null,
    firstResponseAt: l.firstResponseAt?.toISOString() || null,
  }));
  return (
    <div>
      <PageHeader title="Pipeline" description="Drag a lead between stages. The first move off New stops its SLA clock." />
      <PipelineBoard initialLeads={leads} />
    </div>
  );
}
