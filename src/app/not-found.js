import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-20 text-center">
      <div>
        <div className="mx-auto mb-6 grid size-20 place-items-center rounded-3xl bg-primary/10 text-primary">
          <Compass className="size-10" />
        </div>
        <h1 className="font-heading text-4xl font-semibold">This address does not exist</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">The page may have moved or the listing was taken down. Let us get you back on the map.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft">Back home</Link>
          <Link href="/properties?lt=SALE" className="rounded-xl border border-input px-6 py-3 text-sm font-medium hover:bg-muted">Search homes</Link>
        </div>
      </div>
    </main>
  );
}
