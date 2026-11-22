// Guideline-gap insights: grouping and ranking, offline. Usage: npx tsx scripts/test-insights.ts
import assert from "node:assert/strict";
import { runDeterministicChecks } from "../lib/checks/deterministic";
import { SEED_FACTS, SEED_HISTORY, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";
import { groupBySimilarity, missingFacts, normalizeQuote, passRateByChannel, rankGaps, similarity, uncoveredTopics, unclearRules, type InsightFinding } from "../lib/insights/rank";

// 1. Trigram similarity follows pg_trgm (documented example: similarity('word', 'two words') = 0.363636).
assert.equal(similarity("word", "two words").toFixed(6), "0.363636");
assert.equal(similarity("abc", "abc"), 1);
assert.equal(similarity("abc", "xyz"), 0);
assert.equal(normalizeQuote("₹399 — Reduces DARK spots by 30%!"), "reduces dark spots by");
assert.ok(similarity(normalizeQuote("reduces dark spots by 30%"), normalizeQuote("Fades dark spots by 30%")) > 0.5);
assert.ok(similarity(normalizeQuote("reduces dark spots by 30%"), normalizeQuote("vegan and cruelty-free")) < 0.5);
assert.deepEqual(groupBySimilarity(["dark spots by", "dark spot by", "vegan formula"], (s) => s, 0.5).map((g) => g.length), [2, 1]);

// 2. Build the findings exactly as the seed does (rule engine + scripted AI findings + decisions).
const ctx = { rules: SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true })), terms: SEED_TERMS, facts: SEED_FACTS, today: "2026-11-22" };
const rows: InsightFinding[] = [];
SEED_HISTORY.forEach((p, i) => {
  const sid = `s${i}`;
  const managerDecision = p.outcome === "approved" ? "approve" : p.outcome === "changes_requested" ? "request_changes" : null;
  const base = { submissionId: sid, title: p.title, channel: p.channel, confidential: false, status: p.outcome, managerDecision } as const;
  for (const f of runDeterministicChecks({ text: p.text, channel: p.channel }, ctx)) {
    if (p.fixedText) continue; // fixed posts: v2 (the latest check) is clean
    const reason = p.disputes?.[f.ruleCode ?? ""];
    rows.push({ ...base, ruleCode: f.ruleCode, factCode: f.factCode, source: "rule", label: f.label, severity: f.severity, quote: f.quote, decision: reason ? "disputed" : "pending", disputeReason: reason ?? null });
  }
  for (const a of p.aiFindings ?? []) {
    rows.push({ ...base, ruleCode: a.ruleCode, factCode: null, source: "ai", label: a.label, severity: a.severity, quote: a.quote, decision: a.disputeReason ? "disputed" : "pending", disputeReason: a.disputeReason ?? null });
  }
});
const title = (c: string) => SEED_RULES.find((r) => r.code === c)?.title ?? c;

// 3. The planted ambiguous rule (T-02 on festival greetings) ranks first, with its evidence.
const gaps = rankGaps(rows, title);
assert.equal(gaps[0].kind, "unclear_rule");
assert.equal(gaps[0].key, "T-02");
assert.equal(gaps[0].metrics.disputes, 5);
assert.equal(gaps[0].metrics.sidedWithCreator, 4);
assert.equal(gaps[0].metrics.sidedWithRule, 1);
assert.ok(gaps[0].evidence.every((e) => e.disputeReason && e.quote === "!!"));
console.log("  #1:", gaps[0].headline, "—", gaps[0].why);

// 4. The uncovered topic appears (vegan / cruelty-free), as one group.
const unc = uncoveredTopics(rows);
assert.equal(unc.length, 1, `expected one uncovered topic, got ${unc.map((u) => u.key).join(" | ")}`);
assert.match(unc[0].key, /vegan|cruelty/);
assert.equal(unc[0].metrics.findings, 3);
console.log("  uncovered:", unc[0].headline);

// 5. The repeated dark-spots claim is grouped (trigram > 0.5) as a candidate fact.
const mf = missingFacts(rows);
assert.equal(mf.length, 1);
assert.equal(mf[0].metrics.findings, 3);
console.log("  missing fact:", mf[0].headline);

// 6. A rule with a single dispute isn't reported as unclear; ties are stable.
assert.equal(unclearRules(rows.filter((r) => r.ruleCode !== "T-02" || r.submissionId === "s0"), title).length, 0);
// Order: unclear rule (score 5 × 1 × 1.8) > uncovered (3) > missing fact (2.4).
assert.deepEqual(gaps.map((g) => g.kind), ["unclear_rule", "uncovered_topic", "missing_fact"]);

// 7. Pass rate by channel counts first checks with zero findings.
const pr = passRateByChannel([
  { submissionId: "a", channel: "ad", findings: 0, ruleCodes: [] },
  { submissionId: "b", channel: "ad", findings: 2, ruleCodes: ["C-02", "T-02"] },
  { submissionId: "c", channel: "email", findings: 1, ruleCodes: ["T-02"] },
]);
assert.deepEqual(pr.map((x) => [x.channel, x.checked, x.passed, x.passRatePct]), [["ad", 2, 1, 50], ["email", 1, 0, 0]]);

console.log("insights: all assertions passed");
