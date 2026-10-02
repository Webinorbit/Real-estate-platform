import { formatNumber, formatPrice, formatPriceCompact, titleCase } from "@/lib/format";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PILL_BASE =
  "price-pill relative cursor-pointer select-none whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold shadow-lg";

export function createPill(item, currency) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${item.title}, ${formatPrice(item.price, { currency, listingType: item.listingType })}`);
  el.dataset.id = item.id;
  el.className = PILL_BASE;
  el.style.cssText = "background:var(--card);color:var(--card-foreground);border-color:var(--border);";
  const label = document.createElement("span");
  label.textContent = formatPriceCompact(item.price, currency);
  el.appendChild(label);
  if (item.hasTour) {
    const dot = document.createElement("i");
    dot.title = "360° tour";
    dot.style.cssText = "display:inline-block;width:6px;height:6px;border-radius:99px;background:var(--accent);margin-left:6px;vertical-align:middle";
    el.appendChild(dot);
  }
  return el;
}

export function setPillState(el, { active, selected, visited }) {
  const on = active || selected;
  el.dataset.active = on ? "true" : "false";
  if (on) {
    el.style.background = "var(--primary)";
    el.style.color = "var(--primary-foreground)";
    el.style.borderColor = "var(--primary)";
    el.style.zIndex = "20";
  } else {
    el.style.background = visited ? "var(--muted)" : "var(--card)";
    el.style.color = "var(--card-foreground)";
    el.style.borderColor = "var(--border)";
    el.style.zIndex = "";
  }
}

export function createCluster(count) {
  const size = Math.min(64, 36 + Math.log2(count + 1) * 6);
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${count} properties, zoom in`);
  el.className = "price-pill grid cursor-pointer place-items-center rounded-full font-bold text-primary-foreground";
  el.style.cssText = `width:${size}px;height:${size}px;background:var(--primary);box-shadow:0 0 0 6px color-mix(in oklab, var(--primary) 28%, transparent), 0 8px 20px rgb(0 0 0 / .3);font-size:${size > 50 ? 15 : 13}px;`;
  el.textContent = String(count);
  return el;
}

export function popupHtml(item, tenant) {
  const img = item.images?.[0]?.url || "/demo/photos/ext-01.jpg";
  const specs = [
    item.beds ? `${item.beds} bd` : null,
    item.baths ? `${item.baths} ba` : null,
    `${formatNumber(item.areaSqft, tenant.locale)} ${tenant.areaUnit || "sq ft"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return `
  <a href="/properties/${esc(item.slug)}" style="display:block;width:260px;color:inherit;text-decoration:none">
    <div style="position:relative;height:150px;background:#ddd url('${esc(img)}') center/cover">
      <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),transparent 60%)"></div>
      ${item.hasTour ? `<span style="position:absolute;left:10px;top:10px;background:rgba(0,0,0,.65);color:#fff;border-radius:99px;padding:3px 9px;font-size:11px;font-weight:700">360° tour</span>` : ""}
      <span style="position:absolute;left:10px;bottom:8px;color:#fff;font-weight:700;font-size:18px;font-family:var(--font-heading)">${esc(formatPrice(item.price, { currency: tenant.currency, listingType: item.listingType, priceUnit: item.priceUnit }))}</span>
    </div>
    <div style="padding:12px 14px 14px">
      <div style="font-weight:600;font-size:14px;line-height:1.3;margin-bottom:3px">${esc(item.title)}</div>
      <div style="font-size:12px;opacity:.7;margin-bottom:8px">${esc(item.locality)}, ${esc(item.city)} · ${esc(titleCase(item.type))}</div>
      <div style="font-size:12px;font-weight:600">${esc(specs)}</div>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:var(--primary)">View details →</div>
    </div>
  </a>`;
}
