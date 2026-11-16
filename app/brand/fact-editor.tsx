"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

export function FactEditor({ code, value, validUntil }: { code: string; value: string; validUntil: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value);
  const [until, setUntil] = useState(validUntil ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Edit ${code}`}>
        Edit
      </Button>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callApi(`/api/facts/${code}`, "PATCH", { value: v, validUntil: until || null });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex min-w-56 flex-col gap-1.5">
      <Label htmlFor={`v-${code}`} className="text-xs">Value</Label>
      <Input id={`v-${code}`} value={v} onChange={(e) => setV(e.target.value)} className="h-8" />
      <Label htmlFor={`u-${code}`} className="text-xs">Valid until</Label>
      <Input id={`u-${code}`} type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8" />
      <div className="flex gap-1">
        <Button size="sm" type="submit" disabled={busy}>{busy ? "Saving…" : "Save as new version"}</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </form>
  );
}
