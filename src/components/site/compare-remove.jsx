"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useVisitor } from "@/components/site/stores";

export function CompareRemove({ id, ids }) {
  const router = useRouter();
  const v = useVisitor();
  return (
    <button
      type="button"
      onClick={() => {
        v?.toggleCompare(id);
        const rest = ids.filter((x) => x !== id);
        router.replace(rest.length ? `/compare?ids=${rest.join(",")}` : "/compare");
      }}
      className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-danger"
    >
      <X className="size-3.5" /> Remove
    </button>
  );
}
