"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

export function SensitiveTerms({ terms, isManager }: { terms: { id: string; term: string; note: string | null }[]; isManager: boolean }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {terms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sensitive terms yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Sensitive terms">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm" title={t.note ?? undefined}>
              <span className="font-medium">{t.term}</span>
              {t.note && <span className="text-xs text-muted-foreground">· {t.note}</span>}
              {isManager && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => callApi(`/api/sensitive-terms/${t.id}`, "DELETE"))}
                  className="ml-1 rounded-full p-0.5 hover:bg-background"
                  aria-label={`Remove ${t.term}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isManager ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await callApi("/api/sensitive-terms", "POST", { term, note: note || undefined });
              setTerm("");
              setNote("");
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="st-term" className="text-xs">Term</Label>
            <Input id="st-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Project Aurora" className="h-8 w-52" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="st-note" className="text-xs">Note (optional)</Label>
            <Input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. unreleased codename" className="h-8 w-52" />
          </div>
          <Button size="sm" type="submit" disabled={busy || term.trim().length < 2}>
            Add term
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Switch to Manager in the header to edit this list.</p>
      )}
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
