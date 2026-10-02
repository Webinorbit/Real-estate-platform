export default function Loading() {
  return (
    <div className="mx-auto max-w-[90rem] px-4 pb-24 pt-28 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-64 rounded-xl" />
      <div className="skeleton mt-3 h-5 w-96 max-w-full rounded-lg" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="skeleton aspect-[4/3]" />
            <div className="space-y-2.5 p-4">
              <div className="skeleton h-5 w-4/5 rounded-md" />
              <div className="skeleton h-4 w-3/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
