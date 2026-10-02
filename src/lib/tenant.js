import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { planOf } from "@/lib/plans";

export const TENANT_COOKIE = "tenant_override";

export function tenantSwitchAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TENANT_SWITCH === "true";
}

/** Resolves the tenant for the current request (cached per request). The backend picks it from the host. */
export const getTenantOrNull = cache(async () => {
  try {
    return (await api("/api/public/tenant")).tenant;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function getTenant() {
  const tenant = await getTenantOrNull();
  if (!tenant) notFound();
  return tenant;
}

/** Public origin (scheme + host) the visitor used, for canonical URLs, sitemaps and JSON-LD. */
export async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("x-tenant-host") || h.get("host") || "localhost:3000";
  const local = host.startsWith("localhost") || host.includes(".localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto") || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export function tenantFeatures(tenant) {
  return planOf(tenant);
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function readableOn(hex) {
  return luminance(hexToRgb(hex)) > 0.42 ? "#0b0b0f" : "#ffffff";
}

function mixWithWhite(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.round(v + (255 - v) * amount);
  return `#${[m(r), m(g), m(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Per-tenant design tokens injected as CSS variables, re-theming every component. */
export function themeVars(tenant) {
  const primary = tenant?.primaryColor || "#0f766e";
  const accent = tenant?.accentColor || "#f59e0b";
  const primaryDark = luminance(hexToRgb(primary)) < 0.25 ? mixWithWhite(primary, 0.5) : mixWithWhite(primary, 0.12);
  return {
    "--primary": primary,
    "--primary-foreground": readableOn(primary),
    "--primary-dark": primaryDark,
    "--primary-dark-fg": readableOn(primaryDark),
    "--accent": accent,
    "--accent-foreground": readableOn(accent),
    "--font-heading": `var(--font-${tenant?.fontHeading || "playfair"})`,
    "--font-body": `var(--font-${tenant?.fontBody || "inter"})`,
  };
}
