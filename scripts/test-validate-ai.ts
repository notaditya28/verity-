// Unit checks for AI output validation (no network). Usage: npx tsx scripts/test-validate-ai.ts
import assert from "node:assert/strict";
import { validateAiFindings } from "../lib/checks/validate-ai";
import { runDeterministicChecks } from "../lib/checks/deterministic";
import { SEED_FACTS, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";

const rules = SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true }));
const text = "OMG!! India's #1 serum, now just ₹399. Hurry, only fools miss out! Our serum is made in a vegan lab.";
const det = runDeterministicChecks({ text, channel: "ad" }, { rules, terms: SEED_TERMS, facts: SEED_FACTS, today: "2026-11-16" });
const retrievedRules = rules.filter((r) => ["T-01", "M-02", "C-03", "C-01"].includes(r.code));
const retrievedFacts = SEED_FACTS.filter((f) => ["F-12"].includes(f.code));

const base = { category: "tone", label: "unsupported", explanation: "x", suggested_fix: "y", confidence: 0.9 } as const;
const raw = {
  findings: [
    { ...base, rule_code: "T-01", fact_code: "", quote: "only fools miss out" }, // valid → kept
    { ...base, rule_code: "T-01", fact_code: "", quote: "only FOOLS miss out" }, // not exact substring → dropped
    { ...base, rule_code: "ASCI-02", fact_code: "", quote: "Hurry" }, // cited code not retrieved → downgraded
    { ...base, category: "claims", rule_code: "", fact_code: "", quote: "made in a vegan lab" }, // no source → needs_human
    { ...base, rule_code: "T-01", fact_code: "", quote: "Our serum", confidence: 0.4 }, // low confidence → needs_human
    { ...base, category: "claims", rule_code: "C-03", fact_code: "F-12", quote: "₹399", label: "contradicted" }, // dup of deterministic
    { ...base, label: "supported", rule_code: "T-01", fact_code: "", quote: "serum" }, // supported → dropped
    { nonsense: true }, // invalid shape → dropped
  ],
};

const { findings, stats } = validateAiFindings(raw, { text, retrievedRules, retrievedFacts, deterministic: det });
const byQuote = new Map(findings.map((f) => [f.quote, f]));

assert.equal(byQuote.get("only fools miss out")?.label, "unsupported");
assert.equal(byQuote.get("only fools miss out")?.ruleCode, "T-01");
assert.equal(byQuote.get("only fools miss out")?.spanStart, text.indexOf("only fools"));
assert.ok(!byQuote.has("only FOOLS miss out"));
assert.equal(byQuote.get("Hurry")?.label, "needs_human_verification");
assert.equal(byQuote.get("Hurry")?.ruleCode, null);
assert.equal(byQuote.get("made in a vegan lab")?.label, "needs_human_verification");
assert.equal(byQuote.get("made in a vegan lab")?.severity, "medium");
assert.equal(byQuote.get("Our serum")?.label, "needs_human_verification");
assert.ok(!byQuote.has("₹399"));
assert.ok(!byQuote.has("serum"));
assert.equal(stats.droppedInvalidShape, 1);
assert.equal(stats.droppedBadQuote, 1);
assert.equal(stats.droppedDuplicate, 1);
assert.equal(stats.droppedSupported, 1);
assert.equal(findings.length, 4);
assert.throws(() => validateAiFindings({ wrong: 1 }, { text, retrievedRules, retrievedFacts, deterministic: det }));

console.log("validate-ai: all assertions passed", stats);
