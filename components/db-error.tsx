export function DbError({ what }: { what: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">Could not load {what}.</p>
      <p>The database may be waking up. Refresh in a few seconds, or press “Reset demo” if the demo data is missing.</p>
    </div>
  );
}
