"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, MessageSquareWarning, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

type Action = "approve" | "request_changes" | "escalate";

export function ManagerPanel({ submissionId, escalated }: { submissionId: string; escalated: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: Action) {
    setBusy(action);
    setError(null);
    try {
      await callApi(`/api/submissions/${submissionId}/decision`, "POST", { action, comment });
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Manager decision" className="space-y-2 rounded-lg border bg-accent p-3">
      <h2 className="text-sm font-semibold">{escalated ? "Escalated to Legal: final decision" : "Your review"}</h2>
      <Label htmlFor="mgr-comment" className="text-xs">
        Comment (required for “Request changes” and “Escalate”)
      </Label>
      <Textarea id="mgr-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-16 bg-background" />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("approve")} disabled={!!busy}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Approve
        </Button>
        <Button variant="outline" onClick={() => decide("request_changes")} disabled={!!busy}>
          <MessageSquareWarning className="h-4 w-4" aria-hidden /> Request changes
        </Button>
        {!escalated && (
          <Button variant="outline" onClick={() => decide("escalate")} disabled={!!busy}>
            <Scale className="h-4 w-4" aria-hidden /> Escalate to Legal
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </section>
  );
}
