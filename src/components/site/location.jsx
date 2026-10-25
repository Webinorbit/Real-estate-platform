"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Globe2, LocateFixed, Loader2, MapPin, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

/*
 * The visitor's chosen city, remembered per browser. `null` means "All cities".
 * On the first visit we ask the browser for the visitor's position once and pick the nearest city with listings.
 */

const KEY = "location:city";
/** Mirror of the choice for server-rendered pages (the home page reads it). */
export const CITY_COOKIE = "loc_city";
const ASKED = "location:asked";
const EVENT = "location-change";
const NEAR_KM = 150;

let cityCache = null;

export function loadCities() {
  if (!cityCache) {
    cityCache = fetch("/api/public/cities")
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((d) => d.cities || [])
      .catch(() => {
        cityCache = null;
        return [];
      });
  }
  return cityCache;
}

function read() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** The chosen city right now ("" = all cities). Browser only. */
export function getChosenCity() {
  return read();
}

export function setChosenCity(city, source = "manual") {
  try {
    if (city) localStorage.setItem(KEY, city);
    else localStorage.removeItem(KEY);
    localStorage.setItem(ASKED, "1");
  } catch {}
  document.cookie = city
    ? `${CITY_COOKIE}=${encodeURIComponent(city)}; path=/; max-age=31536000; samesite=lax`
    : `${CITY_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { city: city || "", source } }));
}

function subscribe(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The chosen city ("" = all cities). Server render and first paint use "". */
export function useChosenCity() {
  return useSyncExternalStore(subscribe, read, () => "");
}

/** Listens for city changes made in the picker (e.g. to refilter the map). */
export function useOnCityChange(handler) {
  useEffect(() => {
    const fn = (e) => e.detail && handler(e.detail.city, e.detail.source);
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, [handler]);
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { timeout: 10000, maximumAge: 600000 });
  });
}

/** Finds the nearest city with listings. Resolves { city, km } or { city: null } when nothing is close. */
async function detectCity() {
  const [pos, cities] = await Promise.all([currentPosition(), loadCities()]);
  let best = null;
  for (const c of cities) {
    const km = distanceKm(pos, c);
    if (!best || km < best.km) best = { city: c.city, km };
  }
  return best && best.km <= NEAR_KM ? best : { city: null };
}

export function LocationPicker({ overlay, className, onPicked }) {
  const city = useChosenCity();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Home and tours pages are rendered on the server from the city cookie: re-render them when the city changes.
  // (The map page follows the change itself, without a reload.)
  useEffect(() => {
    const fn = () => !pathname.startsWith("/properties") && router.refresh();
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, [pathname, router]);

  // Older visits saved the city only in this browser: copy it to the cookie once.
  useEffect(() => {
    const saved = read();
    if (saved && !document.cookie.split("; ").some((c) => c.startsWith(`${CITY_COOKIE}=`))) setChosenCity(saved, "restore");
  }, []);
  const [cities, setCities] = useState([]);
  const [query, setQuery] = useState("");
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    loadCities().then(setCities);
  }, []);

  // First visit only: try to set the city automatically from the visitor's position.
  useEffect(() => {
    let asked = true;
    try {
      asked = localStorage.getItem(ASKED) === "1" || !!localStorage.getItem(KEY);
    } catch {}
    if (asked || pathname.startsWith("/admin") || pathname.startsWith("/embed")) return;
    try {
      localStorage.setItem(ASKED, "1");
    } catch {}
    const t = setTimeout(() => {
      detectCity()
        .then((res) => {
          if (!res.city) return;
          setChosenCity(res.city, "auto");
          toast.success(`Showing homes in ${res.city}`, { description: "Based on your location.", action: { label: "Change", onClick: () => setOpen(true) } });
        })
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [pathname]);

  const pick = (c, source = "manual") => {
    setChosenCity(c, source);
    setOpen(false);
    setQuery("");
    onPicked?.(c);
  };

  const useMyLocation = async () => {
    setDetecting(true);
    try {
      const res = await detectCity();
      if (res.city) {
        pick(res.city, "auto");
        toast.success(`Showing homes in ${res.city}`, { description: `About ${Math.round(res.km)} km from you.` });
      } else {
        pick(null, "auto");
        toast("No listings near you yet", { description: "Showing homes in all cities instead." });
      }
    } catch (err) {
      toast.error(err?.code === 1 ? "Location access is blocked" : "Couldn't get your location", {
        description: err?.code === 1 ? "Allow location for this site in your browser, or pick a city from the list." : "Pick a city from the list instead.",
      });
    } finally {
      setDetecting(false);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cities.filter((c) => c.city.toLowerCase().includes(q)) : cities;
  }, [cities, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={city ? `Location: ${city}. Change location` : "Choose a location"}
          className={cn(
            "flex max-w-[11rem] items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
            overlay ? "border-white/30 text-white hover:bg-white/10" : "border-border bg-card/70 text-foreground hover:bg-muted",
            className,
          )}
        >
          <MapPin className={cn("size-4 shrink-0", overlay ? "text-accent" : "text-primary")} />
          <span className="truncate">{city || "All cities"}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={detecting}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
        >
          {detecting ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          {detecting ? "Finding your location…" : "Use my current location"}
        </button>

        {cities.length > 6 && (
          <div className="relative mx-1 my-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city"
              aria-label="Search city"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        <div className="my-1 h-px bg-border" />
        <ul className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Cities">
          <li>
            <button type="button" role="option" aria-selected={!city} onClick={() => pick(null)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">
              <Globe2 className="size-4 text-muted-foreground" />
              <span className="flex-1 font-medium">All cities</span>
              {!city && <Check className="size-4 text-primary" />}
            </button>
          </li>
          {shown.map((c) => (
            <li key={c.city}>
              <button type="button" role="option" aria-selected={city === c.city} onClick={() => pick(c.city)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">
                <MapPin className="size-4 text-muted-foreground" />
                <span className="flex-1 font-medium">{c.city}</span>
                <span className="text-xs text-muted-foreground">{c.count}</span>
                {city === c.city && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
          {!shown.length && query && <li className="px-3 py-3 text-sm text-muted-foreground">No listings in &ldquo;{query}&rdquo; yet</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
