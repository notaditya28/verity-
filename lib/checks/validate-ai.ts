// Validates raw LLM output and enforces "no source, no hard flag". Pure: unit-testable without the network.
import { z } from "zod";
import { factEvidence, ruleEvidence } from "./format";
import type { DraftFinding, DraftUsage, EngineFact, EngineRule, Severity } from "./types";

const aiFindingSchema = z.object({
  category: z.enum(["tone", "messaging", "claims"]),
  label: z.enum(["contradicted", "unsupported", "needs_human_verification", "supported"]),
  rule_code: z.string().nullish(),
  fact_code: z.string().nullish(),
  quote: z.string(),
  explanation: z.string().min(1).max(1000),
  suggested_fix: z.string().max(1000),
  confidence: z.number().min(0).max(1),
});

export const aiOutputSchema = z.object({ findings: z.array(z.unknown()).max(20) });

export const MIN_CONFIDENCE = 0.6;

export interface ValidationStats {
  received: number;
  kept: number;
  droppedInvalidShape: number;
  droppedBadQuote: number;
  droppedSupported: number;
  droppedDuplicate: number;
  downgradedCitation: number;
  downgradedConfidence: number;
}

const RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function validateAiFindings(
  raw: unknown,
  args: {
    text: string;
    extractedText?: string | null;
    retrievedRules: EngineRule[];
    retrievedFacts: EngineFact[];
    deterministic: DraftFinding[];
  },
): { findings: DraftFinding[]; stats: ValidationStats; usages: DraftUsage[] } {
  const stats: ValidationStats = {
    received: 0,
    kept: 0,
    droppedInvalidShape: 0,
    droppedBadQuote: 0,
    droppedSupported: 0,
    droppedDuplicate: 0,
    downgradedCitation: 0,
    downgradedConfidence: 0,
  };
  const top = aiOutputSchema.safeParse(raw);
  if (!top.success) throw new Error("AI output did not match the expected shape");
  stats.received = top.data.findings.length;

  const rules = new Map(args.retrievedRules.map((r) => [r.code, r]));
  const facts = new Map(args.retrievedFacts.map((f) => [f.code, f]));
  const out: DraftFinding[] = [];
  // "Supported" claims aren't shown, but they prove the content relies on a fact (for Fact Drift).
  const usages: DraftUsage[] = [];

  for (const item of top.data.findings) {
    const p = aiFindingSchema.safeParse(item);
    if (!p.success) {
      stats.droppedInvalidShape++;
      continue;
    }
    const a = p.data;
    if (a.label === "supported") {
      stats.droppedSupported++;
      const fact = a.fact_code?.trim() ? facts.get(a.fact_code.trim()) : undefined;
      const q = a.quote;
      if (fact && q.trim()) {
        const at = args.text.indexOf(q);
        if (at >= 0) usages.push({ factCode: fact.code, factId: fact.id ?? null, matchedText: q, spanStart: at, spanEnd: at + q.length });
        else if (args.extractedText?.includes(q)) usages.push({ factCode: fact.code, factId: fact.id ?? null, matchedText: q, spanStart: null, spanEnd: null });
      }
      continue;
    }

    // Quote must be an exact substring of the content (body text first, then text read from the image).
    const quote = a.quote;
    let spanStart: number | null = null;
    let spanEnd: number | null = null;
    if (!quote.trim()) {
      stats.droppedBadQuote++;
      continue;
    }
    const idx = args.text.indexOf(quote);
    if (idx >= 0) {
      spanStart = idx;
      spanEnd = idx + quote.length;
    } else if (!args.extractedText || !args.extractedText.includes(quote)) {
      stats.droppedBadQuote++;
      continue;
    }

    // Citations must come from the retrieved set; anything else is stripped and the finding downgraded.
    const ruleCode = a.rule_code?.trim() || null;
    const factCode = a.fact_code?.trim() || null;
    const rule = ruleCode ? rules.get(ruleCode) : undefined;
    const fact = factCode ? facts.get(factCode) : undefined;
    const citedSomethingInvalid = (ruleCode && !rule) || (factCode && !fact);
    let label: DraftFinding["label"] = a.label;
    const notes: string[] = [];
    if (citedSomethingInvalid) {
      stats.downgradedCitation++;
      notes.push("The AI cited a source that was not in the retrieved policy, so it was removed.");
    }
    if (!rule && !fact) {
      if (label !== "needs_human_verification" && !citedSomethingInvalid) stats.downgradedCitation++;
      label = "needs_human_verification";
    }
    if (a.confidence < MIN_CONFIDENCE && label !== "needs_human_verification") {
      stats.downgradedConfidence++;
      label = "needs_human_verification";
      notes.push(`Confidence ${Math.round(a.confidence * 100)}% is below the ${MIN_CONFIDENCE * 100}% threshold.`);
    }

    // Duplicate of a deterministic finding: overlapping span (or, for image text, overlapping quote) and the same
    // rule, fact or category.
    const dup = args.deterministic.some((d) => {
      const sameTopic =
        (rule && d.ruleCode === rule.code) || (fact && d.factCode === fact.code) || d.category === a.category || d.category === rule?.category;
      if (!sameTopic) return false;
      if (d.spanStart !== null && d.spanEnd !== null && spanStart !== null && spanEnd !== null) {
        return spanStart < d.spanEnd && d.spanStart < spanEnd;
      }
      return spanStart === null && d.spanStart === null && !!d.quote && (d.quote.includes(quote) || quote.includes(d.quote));
    });
    if (dup) {
      stats.droppedDuplicate++;
      continue;
    }

    let severity: Severity = rule?.severity ?? (fact ? "high" : "medium");
    if (label === "needs_human_verification" && RANK[severity] > RANK.medium) severity = "medium";

    out.push({
      ruleCode: rule?.code ?? null,
      factCode: fact?.code ?? null,
      source: "ai",
      category: rule?.category ?? a.category,
      severity,
      label,
      spanStart,
      spanEnd,
      quote,
      explanation: [a.explanation.trim(), ...notes].join(" "),
      evidence: fact ? factEvidence(fact) : rule ? ruleEvidence(rule) : null,
      suggestedFix: spanStart !== null ? a.suggested_fix : a.suggested_fix ? `Change “${quote}” to “${a.suggested_fix}”` : null,
      confidence: a.confidence,
    });
  }

  // Drop AI findings that overlap each other on the same span (keep the first, highest confidence wins ties).
  const dedup: DraftFinding[] = [];
  for (const f of out.sort((x, y) => y.confidence - x.confidence)) {
    const clash = dedup.some((d) => d.spanStart !== null && f.spanStart !== null && d.spanStart === f.spanStart && d.spanEnd === f.spanEnd);
    if (clash) stats.droppedDuplicate++;
    else dedup.push(f);
  }
  stats.kept = dedup.length;
  return { findings: dedup, stats, usages };
}
