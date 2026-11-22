"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

/** Manager actions on one open drift alert: send the post back for update, or dismiss with a reason. */
export function DriftActions({ alertId, submissionId }: { alertId: string; submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"send" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function act(action: "send_back" | "dismiss") {
    setBusy(action === "send_back" ? "send" : "dismiss");
    setError(null);
    try {
      await callApi(`/api/drift/${alertId}`, "POST", { action, reason });
      if (action === "send_back") router.push(`/submissions/${submissionId}`);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => act("send_back")} disabled={!!busy}>
          {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
          {busy === "send" ? "Sending back and re-checking…" : "Send back for update"}
        </Button>
        {!dismissing && (
          <Button size="sm" variant="outline" onClick={() => setDismissing(true)} disabled={!!busy}>
            <XCircle className="h-3.5 w-3.5" aria-hidden /> Dismiss (still valid)
          </Button>
        )}
      </div>
      {dismissing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act("dismiss");
          }}
        >
          <div className="min-w-60 flex-1 space-y-1">
            <Label htmlFor={`r-${alertId}`} className="text-xs">Reason (required)</Label>
            <Input id={`r-${alertId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. festival price was correct at the time; post is archived" className="h-8" />
          </div>
          <Button size="sm" type="submit" variant="secondary" disabled={!!busy || reason.trim().length < 3}>
            {busy === "dismiss" ? "Dismissing…" : "Dismiss alert"}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setDismissing(false)}>Cancel</Button>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
