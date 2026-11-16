// Runs the deterministic checks on the built-in samples without a database. Usage: npx tsx scripts/try-samples.ts
import { runDeterministicChecks } from "../lib/checks/deterministic";
import { applyFixes } from "../lib/checks/apply";
import { SAMPLES } from "../lib/demo/samples";
import { SEED_FACTS, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";

const ctx = {
  rules: SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true })),
  terms: SEED_TERMS,
  facts: SEED_FACTS,
  today: "2026-11-16",
};

for (const s of SAMPLES) {
  const findings = runDeterministicChecks({ text: s.text, channel: s.channel }, ctx);
  console.log(`\n=== ${s.label} (${findings.length} findings)`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.ruleCode}${f.factCode ? "/" + f.factCode : ""} ${f.label ?? ""} q=${JSON.stringify(f.quote)} fix=${JSON.stringify(f.suggestedFix)}`);
  }
  const fixed = applyFixes(s.text, findings.map((f) => ({ spanStart: f.spanStart, spanEnd: f.spanEnd, fix: f.suggestedFix })));
  console.log(`  → ${JSON.stringify(fixed.text)}`);
  const recheck = runDeterministicChecks({ text: fixed.text, channel: s.channel }, ctx);
  console.log(`  re-check: ${recheck.length} findings ${recheck.map((f) => f.ruleCode).join(",")}`);
}
