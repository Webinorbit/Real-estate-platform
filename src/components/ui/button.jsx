"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] focus-visible:outline-2";

const variants = {
  primary: "bg-primary text-primary-foreground shadow-soft hover:brightness-110 hover:shadow-lift",
  accent: "bg-accent text-accent-foreground shadow-soft hover:brightness-105 hover:shadow-lift",
  secondary: "bg-muted text-foreground hover:bg-border",
  outline: "border border-input bg-card/60 text-foreground hover:bg-muted hover:border-foreground/30",
  ghost: "text-foreground hover:bg-muted",
  glass: "bg-white/20 text-white border border-white/25 hover:bg-white/25",
  danger: "bg-danger text-white hover:brightness-110",
  link: "text-primary underline-offset-4 hover:underline px-0",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",
};

export function buttonClasses({ variant = "primary", size = "md", className } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant, size, className, loading, children, disabled, type = "button", ...props }) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClasses({ variant, size, className })} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, children, href, ...props }) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
