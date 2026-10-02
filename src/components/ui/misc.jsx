import Image from "next/image";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Card({ className, children, ...props }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card text-card-foreground shadow-soft", className)} {...props}>
      {children}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-muted text-foreground",
  primary: "bg-primary/12 text-primary",
  accent: "bg-accent/20 text-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  dark: "bg-black/60 text-white backdrop-blur",
  light: "bg-white/90 text-black backdrop-blur",
};

export function Badge({ tone = "neutral", className, children, ...props }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", badgeTones[tone], className)} {...props}>
      {children}
    </span>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

export function Avatar({ name, src, size = 40, className }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name || ""}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-7" />
        </div>
      )}
      <h3 className="font-heading text-xl font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted-foreground">{children}</kbd>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
