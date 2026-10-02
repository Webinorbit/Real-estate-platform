export default function Loading() {
  return (
    <div className="space-y-6 p-1" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-56 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-2xl" />
    </div>
  );
}
