"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";

export function MarkConfidentialButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await callApi(`/api/submissions/${submissionId}/confidential`, "POST");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden /> {busy ? "Marking…" : "Mark confidential (can't be undone)"}
      </Button>
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
