"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Reveal({ children, delay = 0, y = 24, className, as = "div" }) {
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Tag>
  );
}

export function CountUp({ to, suffix = "", prefix = "", duration = 1.6, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => c.stop();
  }, [inView, to, duration]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/** Horizontal scroll-snap carousel with arrow controls. */
export function Carousel({ children, className, itemClass = "w-[82vw] sm:w-[22rem]" }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.min(ref.current.clientWidth * 0.85, 760), behavior: "smooth" });

  return (
    <div className={cn("relative", className)}>
      <div ref={ref} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-6 sm:-mx-6 sm:px-6" tabIndex={0} aria-label="Scrollable list">
        {(Array.isArray(children) ? children : [children]).map((c, i) => (
          <div key={i} className={cn("shrink-0 snap-start", itemClass)}>
            {c}
          </div>
        ))}
      </div>
      <button onClick={() => scroll(-1)} disabled={edge.start} aria-label="Scroll left" className="absolute -left-3 top-[38%] z-10 hidden size-11 place-items-center rounded-full border border-border bg-card shadow-lift transition hover:scale-110 disabled:pointer-events-none disabled:opacity-0 lg:grid">
        <ChevronLeft className="size-5" />
      </button>
      <button onClick={() => scroll(1)} disabled={edge.end} aria-label="Scroll right" className="absolute -right-3 top-[38%] z-10 hidden size-11 place-items-center rounded-full border border-border bg-card shadow-lift transition hover:scale-110 disabled:pointer-events-none disabled:opacity-0 lg:grid">
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action, className }) {
  return (
    <Reveal className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
        <h2 className="font-heading text-3xl font-semibold sm:text-4xl">{title}</h2>
        {description && <p className="mt-3 text-base text-muted-foreground">{description}</p>}
      </div>
      {action}
    </Reveal>
  );
}
