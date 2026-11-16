"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RerunButton({ versionId, label = "Run check again" }: { versionId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/versions/${versionId}/check`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The check failed again.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check failed again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={rerun} disabled={busy}>
        {busy ? "Checking…" : label}
      </Button>
      {error && <span role="alert" className="text-xs text-red-800">{error}</span>}
    </span>
  );
}
