"use client";

import { AnimatePresence, motion } from "framer-motion";
import { GitCompare, X } from "lucide-react";
import { useVisitor } from "@/components/site/stores";
import { ButtonLink, Button } from "@/components/ui/button";

export function CompareBar() {
  const v = useVisitor();
  const n = v?.compare.length || 0;
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[94vw] items-center gap-3 rounded-full border border-border bg-card/95 py-2 pl-5 pr-2 shadow-lift backdrop-blur"
          role="region"
          aria-label="Compare properties"
        >
          <GitCompare className="size-5 text-primary" />
          <span className="text-sm font-medium">
            {n} of 3 selected
          </span>
          <Button variant="ghost" size="icon-sm" onClick={v.clearCompare} aria-label="Clear comparison">
            <X className="size-4" />
          </Button>
          <ButtonLink href={`/compare?ids=${v.compare.join(",")}`} size="sm" className="rounded-full" aria-disabled={n < 2}>
            {n < 2 ? "Add one more" : "Compare now"}
          </ButtonLink>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
