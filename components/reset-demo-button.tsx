"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResetDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!confirm("Reset the demo? All submissions and policy edits will be cleared and the seed data restored.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(body.error ?? "Reset failed. Please try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={reset} disabled={busy} aria-label="Reset demo data">
      <RotateCcw className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{busy ? "Resetting…" : "Reset demo"}</span>
    </Button>
  );
}
