export type Category = "tone" | "terminology" | "claims" | "accessibility" | "visual" | "asci" | "messaging";
export type Severity = "low" | "medium" | "high" | "critical";
export type ClaimLabel = "supported" | "contradicted" | "unsupported" | "needs_human_verification";
export type Channel = "instagram" | "ad" | "email" | "document" | "other";

// Minimal shapes the engine needs; DB rows satisfy them structurally, and so do plain seed objects (eval script).
export interface EngineRule {
  code: string;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  checkType: "deterministic" | "ai";
  params: Record<string, unknown>;
  active: boolean;
}

export interface EngineFact {
  code: string;
  subject: string;
  attribute: string;
  value: string;
  unit: string | null;
  owner: string;
  sourceDoc: string;
  validFrom: string;
  validUntil: string | null;
}

export interface EngineTerm {
  banned: string;
  preferred: string | null;
  ruleCode: string;
}

export interface CheckContext {
  rules: EngineRule[];
  terms: EngineTerm[];
  facts: EngineFact[];
  /** ISO date (YYYY-MM-DD) used for fact validity. */
  today: string;
}

export interface CheckInput {
  text: string;
  channel: Channel;
}

/**
 * A finding before it is persisted.
 * Fix convention: spanStart/spanEnd set and start < end → suggestedFix replaces the quote ("" = delete);
 * start === end → suggestedFix is inserted at that position; span null → suggestedFix is advice only.
 */
export interface DraftFinding {
  ruleCode: string | null;
  factCode: string | null;
  source: "rule" | "ai";
  category: Category;
  severity: Severity;
  label: ClaimLabel | null;
  spanStart: number | null;
  spanEnd: number | null;
  quote: string | null;
  explanation: string;
  evidence: string | null;
  suggestedFix: string | null;
  confidence: number;
}
