"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand, Images, View, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function PropertyGallery({ images, title, tourHref }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const list = images.length ? images : [{ url: "/demo/photos/ext-01.jpg", alt: title }];

  const go = useCallback(
    (d) => {
      setDir(d);
      setIdx((i) => (i + d + list.length) % list.length);
    },
    [list.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, go]);

  const show = (i) => {
    setIdx(i);
    setOpen(true);
  };

  const grid = list.slice(0, 5);

  return (
    <>
      <div className={cn("relative grid gap-2 overflow-hidden rounded-3xl", grid.length > 1 ? "md:grid-cols-4 md:grid-rows-2" : "")} style={{ height: "min(62vh, 34rem)" }}>
        {grid.map((img, i) => (
          <button
            key={img.url + i}
            type="button"
            onClick={() => show(i)}
            aria-label={`Open photo ${i + 1} of ${list.length}`}
            className={cn("group relative overflow-hidden bg-muted", i === 0 && grid.length > 1 ? "md:col-span-2 md:row-span-2" : "", i > 0 && "max-md:hidden")}
          >
            <Image src={img.url} alt={img.alt || title} fill priority={i === 0} sizes={i === 0 ? "(max-width: 768px) 100vw, 50vw" : "25vw"} className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
          </button>
        ))}
        <div className="absolute bottom-4 right-4 flex gap-2">
          {tourHref && (
            <Link href={tourHref} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lift transition hover:brightness-110">
              <View className="size-4" /> Walk through in 360°
            </Link>
          )}
          <button type="button" onClick={() => show(0)} className="flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-black shadow-lift transition hover:bg-white">
            <Images className="size-4" /> All {list.length} photos
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${title} photo gallery`}
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex items-center justify-between px-5 py-4 text-white">
              <p className="text-sm font-medium">
                {idx + 1} / {list.length}
              </p>
              <button onClick={() => setOpen(false)} aria-label="Close gallery" className="grid size-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
                <X className="size-5" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <motion.div
                  key={idx}
                  custom={dir}
                  initial={{ opacity: 0, x: dir * 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -60 }}
                  transition={{ duration: 0.28 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -80) go(1);
                    else if (info.offset.x > 80) go(-1);
                  }}
                  className="absolute inset-0"
                >
                  <Image src={list[idx].url} alt={list[idx].alt || title} fill sizes="100vw" className="select-none object-contain" priority />
                </motion.div>
              </AnimatePresence>
              {list.length > 1 && (
                <>
                  <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-4 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30">
                    <ChevronLeft className="size-6" />
                  </button>
                  <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-4 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30">
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>

            <div className="scrollbar-none flex gap-2 overflow-x-auto p-4">
              {list.map((img, i) => (
                <button
                  key={img.url + i}
                  onClick={() => {
                    setDir(i > idx ? 1 : -1);
                    setIdx(i);
                  }}
                  aria-label={`Photo ${i + 1}`}
                  className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-lg transition-all", i === idx ? "ring-2 ring-white" : "opacity-50 hover:opacity-100")}
                >
                  <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
