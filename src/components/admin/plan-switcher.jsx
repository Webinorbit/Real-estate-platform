"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { changePlan } from "@/app/admin/(panel)/plan/actions";
import { SegmentedControl } from "@/components/ui/form";

/** Super-admin only: instantly flip a tenant between plans (handy in sales demos). */
export function PlanSwitcher({ current }) {
  const [pending, start] = useTransition();
  return (
    <div className={pending ? "opacity-60" : ""}>
      <p className="mb-1 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Demo: switch plan</p>
      <SegmentedControl
        size="sm"
        value={current}
        onChange={(plan) =>
          start(async () => {
            const res = await changePlan(plan);
            if (res.ok) toast.success(`Switched to ${plan.toLowerCase()}`);
            else toast.error(res.error);
          })
        }
        options={[{ value: "STARTER", label: "Starter" }, { value: "PRO", label: "Pro" }, { value: "ENTERPRISE", label: "Enterprise" }]}
      />
    </div>
  );
}
