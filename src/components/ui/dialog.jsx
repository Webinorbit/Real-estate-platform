"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className }) {
  return (
    <DialogPrimitive.Overlay
      className={cn("fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm data-[state=open]:animate-[fadeIn_0.2s_ease-out]", className)}
    />
  );
}

export function DialogContent({ className, children, title, description, hideClose, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] max-h-[92dvh] w-[min(94vw,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-lift focus:outline-none data-[state=open]:animate-[dialogIn_0.28s_cubic-bezier(0.2,0.9,0.3,1.1)]",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className={cn("font-heading text-2xl font-semibold", !title && "sr-only")}>{title || "Dialog"}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={cn("mt-1 text-sm text-muted-foreground", !description && "sr-only")}>
          {description || "Dialog content"}
        </DialogPrimitive.Description>
        <div className="mt-4">{children}</div>
        {!hideClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Side sheet used for mobile navigation and filters. */
export function Sheet({ open, onOpenChange, side = "right", title, children, className }) {
  const pos = {
    right: "right-0 top-0 h-dvh w-[min(92vw,26rem)] rounded-l-3xl data-[state=open]:animate-[slideRight_0.3s_cubic-bezier(0.2,0.9,0.3,1)]",
    left: "left-0 top-0 h-dvh w-[min(92vw,22rem)] rounded-r-3xl data-[state=open]:animate-[slideLeft_0.3s_cubic-bezier(0.2,0.9,0.3,1)]",
    bottom: "bottom-0 left-0 right-0 max-h-[88dvh] rounded-t-3xl data-[state=open]:animate-[slideUp_0.32s_cubic-bezier(0.2,0.9,0.3,1)]",
  }[side];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <Overlay />
        <DialogPrimitive.Content
          className={cn("fixed z-[90] flex flex-col overflow-hidden border border-border bg-card shadow-lift focus:outline-none", pos, className)}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <DialogPrimitive.Title className="font-heading text-xl font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-muted">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
