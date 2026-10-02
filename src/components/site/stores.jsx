"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const Ctx = createContext(null);
export const useVisitor = () => useContext(Ctx);

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function ensureVisitorId() {
  const m = document.cookie.match(/(?:^|; )vid=([^;]+)/);
  if (m) return m[1];
  const id = crypto.randomUUID();
  document.cookie = `vid=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  return id;
}

/** Favourites (persisted locally and synced to the server) and the property compare tray. */
export function VisitorProvider({ tenantSlug, children }) {
  const favKey = `fav:${tenantSlug}`;
  const cmpKey = `cmp:${tenantSlug}`;
  const [favs, setFavs] = useState([]);
  const [compare, setCompare] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureVisitorId();
    setFavs(readList(favKey));
    setCompare(readList(cmpKey));
    setReady(true);
  }, [favKey, cmpKey]);

  const toggleFavorite = useCallback(
    (propertyId, title) => {
      setFavs((prev) => {
        const has = prev.includes(propertyId);
        const next = has ? prev.filter((x) => x !== propertyId) : [...prev, propertyId];
        try {
          localStorage.setItem(favKey, JSON.stringify(next));
        } catch {}
        fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, on: !has }),
        }).catch(() => {});
        if (!has) toast.success("Saved to your favourites", { description: title });
        return next;
      });
    },
    [favKey],
  );

  const toggleCompare = useCallback(
    (propertyId) => {
      setCompare((prev) => {
        if (prev.includes(propertyId)) {
          const next = prev.filter((x) => x !== propertyId);
          localStorage.setItem(cmpKey, JSON.stringify(next));
          return next;
        }
        if (prev.length >= 3) {
          toast.info("You can compare up to 3 properties", { description: "Remove one to add another." });
          return prev;
        }
        const next = [...prev, propertyId];
        localStorage.setItem(cmpKey, JSON.stringify(next));
        return next;
      });
    },
    [cmpKey],
  );

  const clearCompare = useCallback(() => {
    setCompare([]);
    localStorage.setItem(cmpKey, "[]");
  }, [cmpKey]);

  const value = useMemo(
    () => ({ ready, favs, compare, toggleFavorite, toggleCompare, clearCompare, isFav: (id) => favs.includes(id), isCompared: (id) => compare.includes(id) }),
    [ready, favs, compare, toggleFavorite, toggleCompare, clearCompare],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
