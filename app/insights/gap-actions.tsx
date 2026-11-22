"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { callApi } from "@/lib/client-api";

interface Suggestion {
  kind: "revise_rule" | "new_rule" | "new_fact";
  title: string;
  description: string;
  rationale: string;
  fact_subject: string;
  fact_attribute: string;
}

/** Manager actions for one gap: draft an AI clarification, review/edit it, then accept it (or edit by hand). */
export function GapActions({ kind, gapKey, rule }: { kind: "unclear_rule" | "uncovered_topic" | "missing_fact"; gapKey: string; rule?: { title: string; description: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [s, setS] = useState<Suggestion | null>(null);
  const [fact, setFact] = useState<{ subject: string; attribute: string; value: string; unit: string; owner: string; sourceDoc: string } | null>(null);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const draft = () =>
    run("draft", async () => {
      const r = await callApi<{ suggestion: Suggestion }>("/api/insights/clarify", "POST", { kind, key: gapKey });
      setS(r.suggestion);
      if (r.suggestion.kind === "new_fact") setFact({ subject: r.suggestion.fact_subject, attribute: r.suggestion.fact_attribute, value: "", unit: "", owner: "", sourceDoc: "" });
    });

  const manual = () =>
    setS({ kind: kind === "unclear_rule" ? "revise_rule" : kind === "uncovered_topic" ? "new_rule" : "new_fact", title: rule?.title ?? "", description: rule?.description ?? "", rationale: "", fact_subject: "", fact_attribute: "" });

  const accept = () =>
    run("accept", async () => {
      if (!s) return;
      if (s.kind === "revise_rule") {
        const r = await callApi<{ policyVersion?: number; unchanged?: boolean }>(`/api/rules/${gapKey}`, "PUT", { title: s.title, description: s.description, note: `Clarified ${gapKey} from guideline-gap insights` });
        setDone(r.unchanged ? "No change: the wording is the same." : `${gapKey} updated as policy version v${r.policyVersion}. The next check uses it.`);
      } else if (s.kind === "new_rule") {
        const r = await callApi<{ code: string; policyVersion: number }>("/api/rules", "POST", { title: s.title, description: s.description, category: "claims", severity: "medium" });
        setDone(`Added ${r.code} (AI-judged) as policy version v${r.policyVersion}. The next check uses it.`);
      } else if (fact) {
        const r = await callApi<{ code: string; policyVersion: number }>("/api/facts", "POST", { ...fact, unit: fact.unit || undefined });
        setDone(`Added ${r.code} to the Fact Registry as policy version v${r.policyVersion}.`);
      }
      setS(null);
      setFact(null);
      router.refresh();
    });

  if (done) {
    return (
      <p role="status" className="text-sm text-emerald-800">
        {done} <Link href="/brand" className="font-medium underline-offset-4 hover:underline">View on Brand</Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!s && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={draft} disabled={!!busy}>
            {busy === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
            {busy === "draft" ? "Drafting…" : kind === "missing_fact" ? "Draft a fact" : "Draft a clarification"}
          </Button>
          <Button size="sm" variant="outline" onClick={manual} disabled={!!busy}>
            {kind === "unclear_rule" ? "Edit the rule by hand" : kind === "uncovered_topic" ? "Write a rule by hand" : "Add a fact by hand"}
          </Button>
        </div>
      )}
      {s && (
        <form
          className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            accept();
          }}
        >
          {s.rationale && (
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">AI suggestion — review before accepting</p>
          )}
          {s.rationale && <p className="text-xs text-muted-foreground">{s.rationale}</p>}
          {s.kind !== "new_fact" ? (
            <>
              <div className="space-y-1">
                <Label htmlFor={`t-${gapKey}`} className="text-xs">Rule title</Label>
                <Input id={`t-${gapKey}`} value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`d-${gapKey}`} className="text-xs">Rule description</Label>
                <Textarea id={`d-${gapKey}`} rows={3} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
              </div>
              {rule && s.kind === "revise_rule" && (
                <p className="text-xs text-muted-foreground">
                  Current: <del>{rule.description}</del>
                </p>
              )}
            </>
          ) : (
            fact && (
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["subject", "Subject"],
                    ["attribute", "Attribute"],
                    ["value", "Approved value (required)"],
                    ["unit", "Unit (e.g. %, INR)"],
                    ["owner", "Owner (required)"],
                    ["sourceDoc", "Source document (required)"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`${k}-${gapKey}`} className="text-xs">{label}</Label>
                    <Input id={`${k}-${gapKey}`} value={fact[k]} onChange={(e) => setFact({ ...fact, [k]: e.target.value })} className="h-8" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground sm:col-span-2">The AI never fills in the value or source: you must enter them from an approved document.</p>
              </div>
            )
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={!!busy || (s.kind === "new_fact" && (!fact?.value || !fact.owner || !fact.sourceDoc))}>
              {busy === "accept" ? "Saving…" : s.kind === "revise_rule" ? "Accept → new rule version" : s.kind === "new_rule" ? "Add as a new rule" : "Add to the Fact Registry"}
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => { setS(null); setFact(null); }}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
