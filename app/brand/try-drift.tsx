"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";

/** Demo helper (Manager): makes a real F-12 edit through the same API as the Fact Registry editor. */
export function TryDrift({ currentValue }: { currentValue: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ affected: number; ms: number; from: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = currentValue === "499" ? "549" : "499";

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await callApi<{ unchanged?: boolean; drift?: { byUsage: number; byScan: number; ms: number } | null }>("/api/facts/F-12", "PATCH", {
        value: target,
        note: `Demo: F-12 price changed to ₹${target}`,
      });
      setMsg({ affected: res.drift ? res.drift.byUsage + res.drift.byScan : 0, ms: res.drift?.ms ?? 0, from: currentValue });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
      <Sparkles className="h-4 w-4 text-primary" aria-hidden />
      <span>
        <b>Try Fact Drift:</b> change the Vitamin C Serum price (F-12) from ₹{currentValue} to ₹{target}. This is a real edit: it creates a new policy version.
      </span>
      <Button size="sm" onClick={run} disabled={busy} className="ml-auto">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {busy ? "Changing…" : `Change F-12 to ₹${target}`}
      </Button>
      {msg && (
        <p role="status" className="w-full">
          {msg.affected > 0 ? (
            <>
              <b>{msg.affected}</b> approved or in-review submission{msg.affected === 1 ? "" : "s"} still use ₹{msg.from} (found in {msg.ms} ms) →{" "}
              <Link href="/drift" className="font-medium text-primary hover:underline">View drift</Link>
            </>
          ) : (
            <>Saved. No approved content uses the old price.</>
          )}
        </p>
      )}
      {error && <p role="alert" className="w-full text-red-800">{error}</p>}
    </div>
  );
}
