"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60";

export function Input({ className, ...props }) {
  return <input className={cn(field, "h-11", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }) {
  return <textarea rows={rows} className={cn(field, "py-3", className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(field, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function Label({ className, children, ...props }) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium text-foreground", className)} {...props}>
      {children}
    </label>
  );
}

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm", className)}>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border transition-all",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange?.(e.target.checked)} />
      {label}
    </label>
  );
}

/** Toggleable pill used for amenities, property types, bed counts, etc. */
export function Chip({ active, children, className, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95",
        active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-input bg-card text-foreground hover:border-foreground/40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SegmentedControl({ options, value, onChange, className, size = "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl bg-muted p-1", className)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg font-medium transition-all",
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
              active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
