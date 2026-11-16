import type { EngineFact, EngineRule } from "./types";

export function factValueDisplay(f: Pick<EngineFact, "value" | "unit">): string {
  if (f.unit === "INR") return `₹${f.value}`;
  if (f.unit === "%") return `${f.value}%`;
  return f.unit ? `${f.value} ${f.unit}` : f.value;
}

export function ruleEvidence(r: Pick<EngineRule, "code" | "title" | "description">): string {
  return `${r.code} — ${r.title}: ${r.description}`;
}

export function factEvidence(f: EngineFact): string {
  return `${f.code} — ${f.subject}, ${f.attribute}: ${factValueDisplay(f)} (source: ${f.sourceDoc}; owner: ${f.owner}; valid ${f.validFrom} → ${f.validUntil ?? "open"})`;
}

export function isFactValid(f: EngineFact, today: string): boolean {
  return f.validFrom <= today && (f.validUntil === null || f.validUntil >= today);
}
