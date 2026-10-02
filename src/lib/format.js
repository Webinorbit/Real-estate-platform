export function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AED: "AED ", AUD: "A$", CAD: "C$", SGD: "S$" };

const trim = (n, d = 2) => Number(n.toFixed(d)).toString();

/** Compact, human price used on markers and cards: ₹2.45 Cr, ₹85 L, $1.2M. */
export function formatPriceCompact(value, currency = "INR") {
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const v = Number(value) || 0;
  if (currency === "INR") {
    if (v >= 1e7) return `${sym}${trim(v / 1e7)} Cr`;
    if (v >= 1e5) return `${sym}${trim(v / 1e5)} L`;
    if (v >= 1e3) return `${sym}${trim(v / 1e3, 1)}K`;
    return `${sym}${v}`;
  }
  if (v >= 1e9) return `${sym}${trim(v / 1e9)}B`;
  if (v >= 1e6) return `${sym}${trim(v / 1e6)}M`;
  if (v >= 1e3) return `${sym}${trim(v / 1e3, 1)}K`;
  return `${sym}${v}`;
}

export function formatPrice(value, { currency = "INR", listingType = "SALE", priceUnit } = {}) {
  const base = formatPriceCompact(value, currency);
  if (listingType === "RENT") return `${base}${priceUnit ? `/${priceUnit}` : "/mo"}`;
  return base;
}

export function formatMoneyFull(value, currency = "INR", locale = "en-IN") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

export function formatNumber(value, locale = "en-IN") {
  return new Intl.NumberFormat(locale).format(value);
}

export function pricePerArea(price, area, currency = "INR") {
  if (!price || !area) return null;
  return formatPriceCompact(Math.round(price / area), currency);
}

export function formatDate(value, locale = "en-IN", opts = { dateStyle: "medium" }) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, opts).format(new Date(value));
}

export function formatDateTime(value, locale = "en-IN") {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(value, now = Date.now()) {
  const diff = Math.round((now - new Date(value).getTime()) / 1000);
  const abs = Math.abs(diff);
  const fmt = (n, unit) => `${n}${unit}`;
  const label = abs < 60 ? "just now" : abs < 3600 ? fmt(Math.floor(abs / 60), "m") : abs < 86400 ? fmt(Math.floor(abs / 3600), "h") : fmt(Math.floor(abs / 86400), "d");
  if (label === "just now") return label;
  return diff >= 0 ? `${label} ago` : `in ${label}`;
}

/** The subset of tenant settings that client-side listing components need. */
export function cardTenant(t) {
  return { currency: t.currency, locale: t.locale, areaUnit: t.areaUnit };
}

export function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function monthlyEmi(principal, annualRatePct, years) {
  const r = annualRatePct / 12 / 100;
  const n = years * 12;
  if (!principal || !n) return 0;
  if (!r) return principal / n;
  return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}
