"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, ImageUp, Loader2, Send, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/client-api";

export function CreatorToolbar({
  submissionId,
  pendingFixable,
  toApply,
  blockers,
  nextVersion,
  hasImage = false,
}: {
  submissionId: string;
  pendingFixable: number;
  toApply: number;
  blockers: number;
  nextVersion: number;
  hasImage?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "apply" | "submit" | "image">(null);

  async function replaceImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("Image is too large. Please use one under 1.5 MB.");
      return;
    }
    setBusy("image");
    setError(null);
    setNote(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const r = await callApi<{ versionNumber: number; checkError: string | null }>(`/api/submissions/${submissionId}/replace-image`, "POST", { imageDataUrl: dataUrl });
      setNote(`Created v${r.versionNumber} with the new image and re-checked it.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(kind: "accept" | "apply" | "submit") {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      if (kind === "accept") await callApi(`/api/submissions/${submissionId}/accept-all`, "POST");
      if (kind === "apply") {
        const r = await callApi<{ versionNumber: number; applied: number; skipped: number; checkError: string | null }>(
          `/api/submissions/${submissionId}/apply-fixes`,
          "POST",
        );
        setNote(`Created v${r.versionNumber} with ${r.applied} fix${r.applied === 1 ? "" : "es"} and re-checked it.${r.skipped ? ` ${r.skipped} overlapping fix(es) skipped.` : ""}`);
      }
      if (kind === "submit") {
        await callApi(`/api/submissions/${submissionId}/submit`, "POST");
        setNote("Submitted. Switch to Manager in the header to review it.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;

  return (
    <section aria-label="Creator actions" className="space-y-2 rounded-lg border bg-accent p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => run("accept")} disabled={!!busy || pendingFixable === 0}>
          {busy === "accept" ? spinner : <CheckCheck className="h-4 w-4" aria-hidden />} Accept all fixes ({pendingFixable})
        </Button>
        <Button onClick={() => run("apply")} disabled={!!busy || toApply === 0}>
          {busy === "apply" ? spinner : <Wand2 className="h-4 w-4" aria-hidden />} Apply {toApply} accepted fix{toApply === 1 ? "" : "es"} → v{nextVersion}
        </Button>
        {hasImage && (
          <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted ${busy ? "pointer-events-none opacity-50" : ""}`}>
            {busy === "image" ? spinner : <ImageUp className="h-4 w-4" aria-hidden />} Upload corrected image → v{nextVersion}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={replaceImage} disabled={!!busy} />
          </label>
        )}
        <Button variant={blockers === 0 && toApply === 0 ? "default" : "outline"} onClick={() => run("submit")} disabled={!!busy}>
          {busy === "submit" ? spinner : <Send className="h-4 w-4" aria-hidden />} Submit for review
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {busy === "apply"
          ? "Applying fixes and re-running the check…"
          : busy === "image"
            ? "Uploading the new image and re-checking…"
          : blockers > 0
            ? `${blockers} high/critical finding${blockers === 1 ? "" : "s"} need${blockers === 1 ? "s" : ""} a decision before you can submit.`
            : toApply > 0
              ? "Apply your accepted fixes, then submit."
              : "Ready to submit. Remaining findings will be visible to the reviewer."}
      </p>
      {note && <p role="status" className="text-sm text-emerald-900">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </section>
  );
}
