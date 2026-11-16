import { Badge } from "@/components/ui/badge";
import type { Fact, Finding, Rule } from "@/lib/db/schema";
import { factValueDisplay } from "@/lib/checks/format";
import { LABEL_TEXT } from "./severity";

function FixText({ f }: { f: Finding }) {
  const fix = f.editedFix ?? f.suggestedFix;
  if (fix === null) return null;
  if (f.spanStart === null || f.spanEnd === null) return <p className="text-sm">{fix}</p>;
  if (f.spanStart === f.spanEnd) {
    return (
      <p className="text-sm">
        Add <ins className="rounded bg-emerald-100 px-1 text-emerald-900 no-underline">{fix.trim()}</ins> {f.spanStart === 0 ? "at the start" : "here"}
      </p>
    );
  }
  if (fix === "") {
    return (
      <p className="text-sm">
        Remove <del className="rounded bg-red-50 px-1 text-red-900">{f.quote?.trim()}</del>
      </p>
    );
  }
  return (
    <p className="text-sm">
      <del className="rounded bg-red-50 px-1 text-red-900">{f.quote?.trim()}</del> →{" "}
      <ins className="rounded bg-emerald-100 px-1 text-emerald-900 no-underline">{fix}</ins>
    </p>
  );
}

export function FindingCard({
  finding: f,
  rule,
  fact,
  children,
}: {
  finding: Finding;
  rule?: Rule;
  fact?: Fact;
  children?: React.ReactNode;
}) {
  return (
    <article id={`finding-${f.id}`} className="space-y-2 rounded-lg border bg-card p-3 shadow-sm" aria-label={`Finding ${f.ruleCode ?? f.factCode ?? ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={f.source === "rule" ? "outline" : "default"}>{f.source === "rule" ? "Rule" : "AI"}</Badge>
        <Badge variant={f.severity}>{f.severity}</Badge>
        {f.label && <Badge variant={f.label === "needs_human_verification" ? "muted" : f.label === "supported" ? "success" : "high"}>{LABEL_TEXT[f.label]}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{Math.round(f.confidence * 100)}% confidence</span>
      </div>

      <div className="space-y-0.5 text-sm font-medium">
        {f.factCode && fact && (
          <p>
            {f.label === "contradicted" ? "Contradicts" : "Cites"} <span className="font-mono">{f.factCode}</span>: {factValueDisplay(fact)}
            <span className="font-normal text-muted-foreground"> ({fact.subject}, {fact.attribute})</span>
          </p>
        )}
        {f.ruleCode && (
          <p>
            Breaks <span className="font-mono">{f.ruleCode}</span>
            {rule ? ` — ${rule.title}` : ""}
          </p>
        )}
      </div>

      {f.quote && f.spanStart !== null && f.spanEnd !== null && f.spanEnd > f.spanStart && (
        <a href={`#span-${f.id}`} className="block text-sm text-muted-foreground hover:underline">
          Found: “{f.quote.trim()}”
        </a>
      )}
      <p className="text-sm">{f.explanation}</p>
      {f.evidence && (
        <blockquote className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">{f.evidence}</blockquote>
      )}
      {(f.suggestedFix !== null || f.editedFix !== null) && (
        <div className="rounded-md bg-muted p-2">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {f.editedFix !== null ? "Your edited fix" : "Suggested fix"}
          </p>
          <FixText f={f} />
        </div>
      )}
      {f.creatorDecision !== "pending" && (
        <p className="text-sm">
          <Badge variant={f.creatorDecision === "disputed" ? "medium" : "success"} className="mr-1.5">
            Creator: {f.creatorDecision}
          </Badge>
          {f.creatorDecision === "disputed" && f.disputeReason && <span className="text-muted-foreground">“{f.disputeReason}”</span>}
        </p>
      )}
      {children}
    </article>
  );
}
