"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Pencil, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

type Decision = "pending" | "accepted" | "edited" | "disputed";

export function FindingActions({
  id,
  decision,
  suggestedFix,
  editedFix,
  hasSpan,
}: {
  id: string;
  decision: Decision;
  suggestedFix: string | null;
  editedFix: string | null;
  hasSpan: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "dispute">("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { decision: Decision; editedFix?: string; disputeReason?: string }) {
    setBusy(true);
    setError(null);
    try {
      await callApi(`/api/findings/${id}`, "PATCH", body);
      setMode("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (decision !== "pending" && mode === "idle") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => send({ decision: "pending" })} disabled={busy}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
        </Button>
        {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      </div>
    );
  }

  if (mode !== "idle") {
    const isEdit = mode === "edit";
    const fieldId = `${mode}-${id}`;
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(isEdit ? { decision: "edited", editedFix: text } : { decision: "disputed", disputeReason: text });
        }}
      >
        <Label htmlFor={fieldId} className="text-xs">
          {isEdit ? (hasSpan ? "Replace the highlighted text with:" : "Your fix:") : "Why is this finding wrong?"}
        </Label>
        <Textarea id={fieldId} rows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus className="min-h-16" />
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={busy || (!isEdit && text.trim().length < 3)}>
            {isEdit ? "Save edit" : "Dispute"}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
        {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => send({ decision: "accepted" })} disabled={busy || suggestedFix === null}>
        <Check className="h-3.5 w-3.5" aria-hidden /> Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setText(editedFix ?? suggestedFix ?? "");
          setMode("edit");
        }}
        disabled={busy}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setText("");
          setMode("dispute");
        }}
        disabled={busy}
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden /> Dispute
      </Button>
      {error && <p role="alert" className="w-full text-xs text-red-800">{error}</p>}
    </div>
  );
}
