"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BedDouble, ChevronDown, MapPin, Search, SlidersHorizontal, X, View, Star, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Chip, SegmentedControl, Select } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger, RangeSlider } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/dialog";
import { AMENITIES, PROPERTY_TYPES } from "@/lib/constants";
import { PRICE_RANGES, SORTS, activeFilterCount } from "@/lib/filters";
import { formatPriceCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

function Trigger({ active, children, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all active:scale-95",
        active ? "border-primary bg-primary/10 text-primary" : "border-input bg-card hover:border-foreground/40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function PriceHistogram({ prices, range, value }) {
  const bins = 24;
  const counts = useMemo(() => {
    const c = Array(bins).fill(0);
    for (const p of prices) {
      const i = Math.min(bins - 1, Math.max(0, Math.floor(((p - range.min) / (range.max - range.min)) * bins)));
      c[i]++;
    }
    return c;
  }, [prices, range, bins]);
  const top = Math.max(1, ...counts);
  return (
    <div className="flex h-12 items-end gap-0.5" aria-hidden>
      {counts.map((c, i) => {
        const mid = range.min + ((i + 0.5) / bins) * (range.max - range.min);
        const inside = mid >= value[0] && mid <= value[1];
        return <span key={i} className={cn("flex-1 rounded-t-sm transition-colors", inside ? "bg-primary/70" : "bg-muted")} style={{ height: `${Math.max(6, (c / top) * 100)}%` }} />;
      })}
    </div>
  );
}

function PriceControl({ filters, onChange, currency, prices }) {
  const range = PRICE_RANGES[filters.lt];
  const value = [filters.min ?? range.min, filters.max ?? range.max];
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft([filters.min ?? range.min, filters.max ?? range.max]), [filters.min, filters.max, filters.lt]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (v) => onChange({ min: v[0] <= range.min ? null : v[0], max: v[1] >= range.max ? null : v[1] });
  return (
    <div className="space-y-4">
      <PriceHistogram prices={prices} range={range} value={draft} />
      <RangeSlider value={draft} min={range.min} max={range.max} step={range.step} onValueChange={setDraft} onValueCommit={commit} label="Price" />
      <div className="flex items-center justify-between text-sm">
        <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold">{formatPriceCompact(draft[0], currency)}</span>
        <span className="text-muted-foreground">to</span>
        <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold">
          {draft[1] >= range.max ? `${formatPriceCompact(range.max, currency)}+` : formatPriceCompact(draft[1], currency)}
        </span>
      </div>
    </div>
  );
}

const COUNTS = [null, 1, 2, 3, 4, 5];

function CountChips({ value, onChange, label }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {COUNTS.map((n) => (
          <Chip key={String(n)} active={value === n} onClick={() => onChange(n)}>
            {n === null ? "Any" : `${n}+`}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function TypeChips({ filters, onChange }) {
  const toggle = (v) => onChange({ types: filters.types.includes(v) ? filters.types.filter((t) => t !== v) : [...filters.types, v] });
  return (
    <div className="flex flex-wrap gap-2">
      {PROPERTY_TYPES.map((t) => (
        <Chip key={t.value} active={filters.types.includes(t.value)} onClick={() => toggle(t.value)}>
          {t.label}
        </Chip>
      ))}
    </div>
  );
}

function MoreFilters({ filters, onChange, toursEnabled, areaUnit }) {
  const toggleAmen = (a) => onChange({ amen: filters.amen.includes(a) ? filters.amen.filter((x) => x !== a) : [...filters.amen, a] });
  const area = [filters.minArea ?? 0, filters.maxArea ?? 10000];
  const [draft, setDraft] = useState(area);
  useEffect(() => setDraft([filters.minArea ?? 0, filters.maxArea ?? 10000]), [filters.minArea, filters.maxArea]);
  return (
    <div className="space-y-7 p-5">
      <section>
        <p className="mb-3 text-sm font-semibold">Property type</p>
        <TypeChips filters={filters} onChange={onChange} />
      </section>
      <div className="grid gap-6 sm:grid-cols-2">
        <CountChips label="Bedrooms" value={filters.beds} onChange={(beds) => onChange({ beds })} />
        <CountChips label="Bathrooms" value={filters.baths} onChange={(baths) => onChange({ baths })} />
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between text-sm">
          <p className="font-semibold">Area ({areaUnit})</p>
          <span className="text-muted-foreground">
            {draft[0].toLocaleString()} to {draft[1] >= 10000 ? "10,000+" : draft[1].toLocaleString()}
          </span>
        </div>
        <RangeSlider
          value={draft}
          min={0}
          max={10000}
          step={100}
          label="Area"
          onValueChange={setDraft}
          onValueCommit={(v) => onChange({ minArea: v[0] <= 0 ? null : v[0], maxArea: v[1] >= 10000 ? null : v[1] })}
        />
      </section>
      <section>
        <p className="mb-3 text-sm font-semibold">Amenities</p>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => (
            <Chip key={a} active={filters.amen.includes(a)} onClick={() => toggleAmen(a)}>
              {a}
            </Chip>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        {toursEnabled && <Checkbox checked={filters.tour} onChange={(tour) => onChange({ tour })} label="Only homes with a 360° virtual tour" />}
        <Checkbox checked={filters.feat} onChange={(feat) => onChange({ feat })} label="Featured homes only" />
      </section>
    </div>
  );
}

export function FilterBar({ filters, onChange, onReset, localities, prices, currency, areaUnit, toursEnabled, resultCount, onSaveSearch }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setSuggestOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const suggestions = useMemo(() => {
    const n = q.trim().toLowerCase();
    return localities.filter((l) => !n || l.label.toLowerCase().includes(n)).slice(0, 6);
  }, [q, localities]);

  const activeCount = activeFilterCount(filters);
  const priceActive = filters.min != null || filters.max != null;
  const bedsBathsActive = filters.beds != null || filters.baths != null;

  const chips = [];
  if (filters.q) chips.push({ key: "q", label: `"${filters.q}"`, clear: { q: "" } });
  if (priceActive) chips.push({ key: "price", label: `${formatPriceCompact(filters.min ?? 0, currency)} - ${filters.max != null ? formatPriceCompact(filters.max, currency) : "Any"}`, clear: { min: null, max: null } });
  if (filters.beds != null) chips.push({ key: "beds", label: `${filters.beds}+ beds`, clear: { beds: null } });
  if (filters.baths != null) chips.push({ key: "baths", label: `${filters.baths}+ baths`, clear: { baths: null } });
  filters.types.forEach((t) => chips.push({ key: `t-${t}`, label: PROPERTY_TYPES.find((x) => x.value === t)?.label || t, clear: { types: filters.types.filter((x) => x !== t) } }));
  filters.amen.forEach((a) => chips.push({ key: `a-${a}`, label: a, clear: { amen: filters.amen.filter((x) => x !== a) } }));
  if (filters.minArea != null || filters.maxArea != null) chips.push({ key: "area", label: `${filters.minArea ?? 0}-${filters.maxArea ?? "Any"} ${areaUnit}`, clear: { minArea: null, maxArea: null } });
  if (filters.tour) chips.push({ key: "tour", label: "360° tour", clear: { tour: false } });
  if (filters.feat) chips.push({ key: "feat", label: "Featured", clear: { feat: false } });
  if (filters.poly) chips.push({ key: "poly", label: "Drawn area", clear: { poly: null } });
  if (filters.near) chips.push({ key: "near", label: `Within ${filters.near[2]} km`, clear: { near: null } });

  return (
    <div className="border-b border-border bg-background">
      <div className="scrollbar-none flex items-center gap-2.5 overflow-x-auto px-4 py-3 sm:px-6">
        <SegmentedControl
          options={[{ value: "SALE", label: "Buy" }, { value: "RENT", label: "Rent" }]}
          value={filters.lt}
          onChange={(lt) => onChange({ lt, min: null, max: null })}
          className="shrink-0"
        />

        <div ref={boxRef} className="relative min-w-[13rem] max-w-md flex-1 max-sm:min-w-[10rem]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onChange({ q: q.trim() });
                setSuggestOpen(false);
              }
            }}
            onFocus={() => setSuggestOpen(true)}
            placeholder="Search area, city, keyword"
            aria-label="Search location or keyword"
            className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-9 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          {q && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                onChange({ q: "" });
              }}
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          )}
          <AnimatePresence>
            {suggestOpen && suggestions.length > 0 && (
              <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift" role="listbox">
                {suggestions.map((l) => (
                  <li
                    key={l.label}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQ(l.label);
                      onChange({ q: l.label });
                      setSuggestOpen(false);
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-primary/10"
                  >
                    <MapPin className="size-4 text-primary" />
                    {l.label}
                    <span className="ml-auto text-xs text-muted-foreground">{l.count}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden items-center gap-2.5 lg:flex">
          <Popover>
            <PopoverTrigger asChild>
              <Trigger active={priceActive}>
                Price <ChevronDown className="size-4" />
              </Trigger>
            </PopoverTrigger>
            <PopoverContent className="w-[22rem]">
              <PriceControl filters={filters} onChange={onChange} currency={currency} prices={prices} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Trigger active={bedsBathsActive}>
                <BedDouble className="size-4" /> Beds &amp; baths <ChevronDown className="size-4" />
              </Trigger>
            </PopoverTrigger>
            <PopoverContent className="w-[22rem] space-y-5">
              <CountChips label="Bedrooms" value={filters.beds} onChange={(beds) => onChange({ beds })} />
              <CountChips label="Bathrooms" value={filters.baths} onChange={(baths) => onChange({ baths })} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Trigger active={filters.types.length > 0}>
                Type{filters.types.length > 0 && ` (${filters.types.length})`} <ChevronDown className="size-4" />
              </Trigger>
            </PopoverTrigger>
            <PopoverContent className="w-[24rem]">
              <TypeChips filters={filters} onChange={onChange} />
            </PopoverContent>
          </Popover>

          {toursEnabled && (
            <Trigger active={filters.tour} onClick={() => onChange({ tour: !filters.tour })} aria-pressed={filters.tour}>
              <View className="size-4" /> 360° tour
            </Trigger>
          )}
        </div>

        <Trigger active={activeCount > 0} onClick={() => setMoreOpen(true)}>
          <SlidersHorizontal className="size-4" />
          <span className="max-lg:hidden">All filters</span>
          <span className="lg:hidden">Filters</span>
          {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{activeCount}</span>}
        </Trigger>

        <div className="ml-auto hidden w-44 shrink-0 xl:block">
          <Select aria-label="Sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} className="h-11 rounded-full">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        <Button variant="outline" size="md" className="hidden shrink-0 rounded-full 2xl:inline-flex" onClick={onSaveSearch}>
          <Bookmark className="size-4" /> Save search
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="scrollbar-none flex items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
              {chips.map((c) => (
                <motion.button
                  layout
                  key={c.key}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={() => onChange(c.clear)}
                  className="group flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  aria-label={`Remove filter ${c.label}`}
                >
                  {c.label}
                  <X className="size-3.5 opacity-60 group-hover:opacity-100" />
                </motion.button>
              ))}
              <button onClick={onReset} className="shrink-0 px-2 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Clear all
              </button>
              <button onClick={onSaveSearch} className="flex shrink-0 items-center gap-1 px-2 text-xs font-semibold text-primary hover:underline">
                <Star className="size-3.5" /> Save this search
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Filters" side="right">
        <div className="lg:hidden">
          <div className="border-b border-border p-5">
            <p className="mb-3 text-sm font-semibold">Price</p>
            <PriceControl filters={filters} onChange={onChange} currency={currency} prices={prices} />
          </div>
        </div>
        <MoreFilters filters={filters} onChange={onChange} toursEnabled={toursEnabled} areaUnit={areaUnit} />
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card p-4">
          <Button variant="ghost" onClick={onReset}>Reset</Button>
          <Button onClick={() => setMoreOpen(false)}>Show {resultCount} homes</Button>
        </div>
      </Sheet>
    </div>
  );
}
