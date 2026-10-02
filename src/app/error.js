"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-20 text-center">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">An unexpected error occurred. You can try again, and if it keeps happening please let us know.</p>
        <button onClick={reset} className="mt-8 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-soft">
          Try again
        </button>
      </div>
    </main>
  );
}
