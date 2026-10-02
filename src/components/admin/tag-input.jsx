"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function TagInput({ value, onChange, placeholder, suggestions = [], max = 30 }) {
  const [draft, setDraft] = useState("");
  const add = (raw) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase()) || value.length >= max) return setDraft("");
    onChange([...value, t.slice(0, 60)]);
    setDraft("");
  };
  const open = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 6);
  return (
    <div>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card px-2.5 py-1.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/12 py-1 pl-3 pr-1.5 text-xs font-medium text-primary">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))} className="grid size-4 place-items-center rounded-full hover:bg-primary/20">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      {draft && open.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary hover:text-primary">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
