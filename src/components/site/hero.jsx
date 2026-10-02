"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Crosshair, MapPin, Search, Sparkles } from "lucide-react";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PROPERTY_TYPES } from "@/lib/constants";
import { formatPriceCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIERS = {
  SALE: [2_500_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000, 250_000_000],
  RENT: [25_000, 50_000, 100_000, 200_000, 400_000, 800_000],
};

export function Hero({ tenant, images, localities, stats }) {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [lt, setLt] = useState("SALE");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [max, setMax] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);

  useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % images.length), 7000);
    return () => clearInterval(t);
  }, [images.length]);

  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return localities.filter((l) => !needle || l.label.toLowerCase().includes(needle)).slice(0, 7);
  }, [q, localities]);

  const submit = (e, override) => {
    e?.preventDefault();
    const p = new URLSearchParams();
    p.set("lt", lt);
    const query = override ?? q;
    if (query) p.set("q", query);
    if (type) p.set("types", type);
    if (max) p.set("max", max);
    router.push(`/properties?${p.toString()}`);
  };

  const nearMe = () => {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser");
    toast.loading("Finding homes near you...", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss("geo");
        router.push(`/properties?lt=${lt}&near=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)},8`);
      },
      () => toast.error("We couldn't get your location", { id: "geo", description: "Allow location access or search by area." }),
      { timeout: 8000 },
    );
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && hi >= 0) {
      e.preventDefault();
      setQ(suggestions[hi].label);
      setOpen(false);
      submit(null, suggestions[hi].label);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden text-white">
      <div className="absolute inset-0 -z-10 bg-black">
        <AnimatePresence initial={false}>
          <motion.div key={slide} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.6 }}>
            <Image src={images[slide]} alt="" fill priority={slide === 0} sizes="100vw" className="object-cover" style={{ animation: "kenburns 14s ease-out forwards" }} />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/80" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,transparent,rgb(0_0_0/0.45))]" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }} className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <Sparkles className="size-4 text-accent" /> Map search · 360° tours · Matched advisors
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance font-heading text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
            {tenant.tagline || `Find a home you will love`}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-white/85">
            Explore {stats.properties}+ verified listings on the map, walk through them in 360°, and get matched with the advisor who knows the neighbourhood best.
          </p>
        </motion.div>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="relative z-10 mx-auto mt-10 max-w-5xl rounded-3xl border border-white/20 bg-white/90 p-3 text-foreground shadow-lift backdrop-blur-xl dark:bg-card/90"
          role="search"
        >
          <div className="mb-3 flex gap-1 px-1">
            {[
              ["SALE", "Buy"],
              ["RENT", "Rent"],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setLt(v);
                  setMax("");
                }}
                className={cn("relative rounded-full px-5 py-2 text-sm font-semibold transition-colors", lt === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {lt === v && <motion.span layoutId="hero-lt" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-[1.6fr_1fr_1fr_auto]">
            <div ref={boxRef} className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                  setHi(-1);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKey}
                placeholder="Area, locality, city or landmark"
                aria-label="Location"
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                aria-controls="hero-suggest"
                className="h-14 w-full rounded-2xl border border-input bg-card pl-12 pr-12 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <button type="button" onClick={nearMe} aria-label="Use my location" title="Use my location" className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-primary">
                <Crosshair className="size-5" />
              </button>
              <AnimatePresence>
                {open && suggestions.length > 0 && (
                  <motion.ul
                    id="hero-suggest"
                    role="listbox"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lift"
                  >
                    {suggestions.map((l, i) => (
                      <li
                        key={l.label}
                        role="option"
                        aria-selected={i === hi}
                        onMouseEnter={() => setHi(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setQ(l.label);
                          setOpen(false);
                          submit(null, l.label);
                        }}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === hi && "bg-primary/10")}
                      >
                        <MapPin className="size-4 text-primary" />
                        <span className="font-medium">{l.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{l.count} homes</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            <Select aria-label="Property type" value={type} onChange={(e) => setType(e.target.value)} className="h-14 rounded-2xl">
              <option value="">Any type</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>

            <Select aria-label="Maximum price" value={max} onChange={(e) => setMax(e.target.value)} className="h-14 rounded-2xl">
              <option value="">Any budget</option>
              {TIERS[lt].map((v) => (
                <option key={v} value={v}>Up to {formatPriceCompact(v, tenant.currency)}</option>
              ))}
            </Select>

            <Button type="submit" size="lg" className="h-14 rounded-2xl px-8 text-base">
              <Search className="size-5" /> Search
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-3 text-sm">
            <span className="text-muted-foreground">Popular:</span>
            {localities.slice(0, 5).map((l) => (
              <button key={l.label} type="button" onClick={() => submit(null, l.label)} className="rounded-full border border-border bg-card px-3 py-1 font-medium transition hover:border-primary hover:text-primary">
                {l.label}
              </button>
            ))}
          </div>
        </motion.form>

        <motion.a
          href="#featured"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mx-auto mt-10 flex w-fit items-center gap-2 text-sm font-medium text-white/80 hover:text-white"
        >
          See featured homes <ArrowRight className="size-4 rotate-90" />
        </motion.a>
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden>
          {images.map((_, i) => (
            <button key={i} tabIndex={-1} aria-label={`Show slide ${i + 1}`} onClick={() => setSlide(i)} className={cn("h-1.5 rounded-full bg-white transition-all", i === slide ? "w-8" : "w-2 opacity-50")} />
          ))}
        </div>
      )}
    </section>
  );
}
