"use client";

import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/** POSTs files to /api/uploads and returns urls. Reports progress through `onProgress` (0..1). */
export function uploadFiles(files, kind, onProgress) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set("kind", kind);
    [...files].forEach((f) => body.append("file", f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) return reject(new Error(data.error || "Upload failed"));
        resolve(data.files);
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

export function useUploader(kind) {
  const [progress, setProgress] = useState(null);
  const upload = useCallback(
    async (files) => {
      setProgress(0);
      try {
        const results = await uploadFiles(files, kind, setProgress);
        const ok = results.filter((r) => r.url);
        results.filter((r) => r.error).forEach((r) => toast.error(`${r.name}: ${r.error}`));
        return ok;
      } catch (err) {
        toast.error(err.message);
        return [];
      } finally {
        setProgress(null);
      }
    },
    [kind],
  );
  return { upload, progress, uploading: progress !== null };
}

export function DropZone({ onFiles, uploading, progress, multiple = true, label = "Drop images here or click to browse", hint, className, compact }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
      className={cn("relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed text-center transition-colors", compact ? "p-4" : "p-8", over ? "border-primary bg-primary/8" : "border-input bg-muted/40 hover:border-primary/60", className)}
    >
      <input ref={input} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={(e) => e.target.files?.length && onFiles([...e.target.files])} />
      {uploading ? (
        <>
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-sm font-medium">Uploading… {Math.round((progress || 0) * 100)}%</p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-all" style={{ width: `${(progress || 0) * 100}%` }} /></div>
        </>
      ) : (
        <>
          <UploadCloud className="size-7 text-primary" />
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </>
      )}
    </div>
  );
}

function SortableThumb({ item, index, onRemove, onAlt }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.url });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group relative overflow-hidden rounded-xl border border-border bg-card", isDragging && "z-10 shadow-lift ring-2 ring-primary")}>
      <div className="relative aspect-[4/3] cursor-grab touch-none bg-muted active:cursor-grabbing" {...attributes} {...listeners}>
        <Image src={item.url} alt={item.alt || ""} fill sizes="200px" className="pointer-events-none object-cover" />
        {index === 0 && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground"><Star className="size-3" /> Cover</span>}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(item.url)}
          aria-label="Remove photo"
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <input
        value={item.alt || ""}
        onChange={(e) => onAlt(item.url, e.target.value)}
        placeholder="Describe this photo"
        aria-label="Photo description"
        className="w-full border-t border-border bg-transparent px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40"
      />
    </li>
  );
}

/** Multi-image field with drag-and-drop upload, drag reordering, alt text and cover selection. */
export function ImageListField({ value, onChange, kind = "photo", max = 30 }) {
  const { upload, uploading, progress } = useUploader(kind);
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const add = async (files) => {
    const room = max - value.length;
    if (room <= 0) return toast.error(`You can add up to ${max} photos`);
    const ok = await upload(files.slice(0, room));
    if (ok.length) onChange([...value, ...ok.map((f) => ({ url: f.url, alt: "" }))]);
  };

  return (
    <div className="space-y-3">
      <DropZone onFiles={add} uploading={uploading} progress={progress} hint={`JPG, PNG or WebP · up to 25 MB each · ${value.length}/${max}`} />
      {value.length > 0 && (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (over && active.id !== over.id) {
              const from = value.findIndex((v) => v.url === active.id);
              const to = value.findIndex((v) => v.url === over.id);
              onChange(arrayMove(value, from, to));
            }
          }}
        >
          <SortableContext items={value.map((v) => v.url)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {value.map((item, i) => (
                <SortableThumb key={item.url} item={item} index={i} onRemove={(url) => onChange(value.filter((v) => v.url !== url))} onAlt={(url, alt) => onChange(value.map((v) => (v.url === url ? { ...v, alt } : v)))} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {value.length === 0 && !uploading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ImagePlus className="size-4" /> The first photo becomes the cover image. Drag to reorder.</p>
      )}
    </div>
  );
}
