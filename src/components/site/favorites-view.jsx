"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { PropertyCard, PropertyCardSkeleton } from "@/components/site/property-card";
import { useVisitor } from "@/components/site/stores";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export function FavoritesView({ tenant }) {
  const v = useVisitor();
  const [items, setItems] = useState(null);
  const key = v?.favs.join(",");

  useEffect(() => {
    if (!v?.ready) return;
    if (!v.favs.length) {
      setItems([]);
      return;
    }
    let live = true;
    fetch(`/api/properties/by-ids?ids=${v.favs.join(",")}`)
      .then((r) => r.json())
      .then((d) => live && setItems(d.items))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.ready, key]);

  if (items === null) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <PropertyCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const visible = items.filter((p) => v.isFav(p.id));
  if (!visible.length) {
    return (
      <EmptyState
        icon={Heart}
        title="No favourites yet"
        description="Tap the heart on any home to save it here. Your list stays on this device and syncs with your visitor profile."
        action={<ButtonLink href="/properties?lt=SALE">Browse homes</ButtonLink>}
      />
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence>
        {visible.map((p) => (
          <PropertyCard key={p.id} p={p} tenant={tenant} />
        ))}
      </AnimatePresence>
    </div>
  );
}
