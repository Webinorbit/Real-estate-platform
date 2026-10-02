"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bath, BedDouble, ChevronLeft, ChevronRight, GitCompare, Heart, Maximize2, View } from "lucide-react";
import { useVisitor } from "@/components/site/stores";
import { Badge } from "@/components/ui/misc";
import { formatPrice, formatNumber, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HeartButton({ id, title, className, size = "md" }) {
  const v = useVisitor();
  const on = v?.isFav(id);
  return (
    <button
      type="button"
      aria-pressed={!!on}
      aria-label={on ? "Remove from favourites" : "Save to favourites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        v?.toggleFavorite(id, title);
      }}
      className={cn(
        "relative grid place-items-center rounded-full bg-white/90 text-black shadow-soft backdrop-blur transition-transform hover:scale-110 active:scale-90",
        size === "lg" ? "size-12" : "size-9",
        className,
      )}
    >
      <motion.span key={String(on)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>
        <Heart className={cn(size === "lg" ? "size-6" : "size-[18px]", on && "fill-red-500 text-red-500")} />
      </motion.span>
      <AnimatePresence>
        {on && (
          <motion.span
            key="burst"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-red-400"
          />
        )}
      </AnimatePresence>
    </button>
  );
}

export function PropertyCard({ p, tenant, active, onHover, priority, compact, className }) {
  const v = useVisitor();
  const [idx, setIdx] = useState(0);
  const images = p.images?.length ? p.images : [{ url: "/demo/photos/ext-01.jpg", alt: p.title }];
  const compared = v?.isCompared(p.id);

  const step = (e, dir) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + dir + images.length) % images.length);
  };

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      onMouseEnter={() => onHover?.(p.id)}
      onMouseLeave={() => onHover?.(null)}
      data-active={active ? "true" : "false"}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card transition-all duration-300",
        active ? "border-primary shadow-lift ring-2 ring-primary/30" : "border-border shadow-soft hover:-translate-y-1 hover:shadow-lift",
        className,
      )}
    >
      <Link href={`/properties/${p.slug}`} className="block" aria-label={p.title}>
        <div className={cn("relative overflow-hidden bg-muted", compact ? "aspect-[16/10]" : "aspect-[4/3]")}>
          <AnimatePresence initial={false}>
            <motion.div key={idx} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <Image
                src={images[idx].url}
                alt={images[idx].alt || p.title}
                fill
                sizes="(max-width: 768px) 92vw, (max-width: 1280px) 40vw, 28vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                priority={priority && idx === 0}
              />
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {p.featured && <Badge tone="accent" className="bg-accent text-accent-foreground">Featured</Badge>}
            {p.listingType === "RENT" && <Badge tone="light">For rent</Badge>}
            {p.hasTour && (
              <Badge tone="dark">
                <View className="size-3.5" /> 360° tour
              </Badge>
            )}
          </div>

          {images.length > 1 && (
            <>
              <button onClick={(e) => step(e, -1)} aria-label="Previous photo" className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-0 shadow transition group-hover:opacity-100 max-md:opacity-100">
                <ChevronLeft className="size-4" />
              </button>
              <button onClick={(e) => step(e, 1)} aria-label="Next photo" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black opacity-0 shadow transition group-hover:opacity-100 max-md:opacity-100">
                <ChevronRight className="size-4" />
              </button>
              <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
                {images.map((_, i) => (
                  <span key={i} className={cn("h-1.5 rounded-full bg-white transition-all", i === idx ? "w-4 opacity-100" : "w-1.5 opacity-60")} />
                ))}
              </div>
            </>
          )}

          <div className="absolute bottom-3 left-3 rounded-xl bg-black/55 px-3 py-1.5 text-white backdrop-blur">
            <span className="font-heading text-lg font-semibold">{formatPrice(p.price, { currency: tenant.currency, listingType: p.listingType, priceUnit: p.priceUnit })}</span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="line-clamp-1 font-heading text-lg font-semibold leading-snug">{p.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
            {p.locality}, {p.city} · {titleCase(p.type)}
          </p>
          <div className="mt-3 flex items-center gap-4 text-sm text-foreground/80">
            {p.beds > 0 && (
              <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-primary" />{p.beds} bd</span>
            )}
            {p.baths > 0 && (
              <span className="flex items-center gap-1.5"><Bath className="size-4 text-primary" />{p.baths} ba</span>
            )}
            <span className="flex items-center gap-1.5"><Maximize2 className="size-4 text-primary" />{formatNumber(p.areaSqft, tenant.locale)} {tenant.areaUnit || "sq ft"}</span>
          </div>
        </div>
      </Link>

      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <HeartButton id={p.id} title={p.title} />
        <button
          type="button"
          aria-pressed={!!compared}
          aria-label={compared ? "Remove from comparison" : "Add to comparison"}
          onClick={(e) => {
            e.preventDefault();
            v?.toggleCompare(p.id);
          }}
          className={cn(
            "grid size-9 place-items-center rounded-full shadow-soft backdrop-blur transition-all hover:scale-110 active:scale-90 max-md:hidden",
            compared ? "bg-primary text-primary-foreground" : "bg-white/90 text-black opacity-0 group-hover:opacity-100",
          )}
        >
          <GitCompare className="size-[17px]" />
        </button>
      </div>
    </motion.article>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="skeleton aspect-[4/3]" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-5 w-4/5 rounded-md" />
        <div className="skeleton h-4 w-3/5 rounded-md" />
        <div className="skeleton h-4 w-2/5 rounded-md" />
      </div>
    </div>
  );
}
