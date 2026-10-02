import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function absoluteUrl(host, path = "") {
  const proto = host.startsWith("localhost") || host.includes(".localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}${path}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Safely parse the first image URL from a Property.images JSON value. */
export function firstImage(images) {
  return Array.isArray(images) && images[0]?.url ? images[0].url : "/demo/photos/ext-01.jpg";
}

export function heroImages(tenant) {
  const list = String(tenant?.heroImageUrl || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ["/demo/photos/hero-01.jpg"];
}
