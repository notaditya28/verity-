// Shown while a server page loads its data.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-64 animate-pulse rounded bg-muted" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
