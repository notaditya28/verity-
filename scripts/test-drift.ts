// Offline checks for Fact Drift value matching and usage recording. Usage: npx tsx scripts/test-drift.ts
import assert from "node:assert/strict";
import { runDeterministicChecksWithUsages } from "../lib/checks/deterministic";
import { imageTextCheck } from "../lib/checks/image-checks";
import { SEED_APPROVED_POSTS, SEED_FACTS, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";
import { contextSnippet, displayValue, findValueMentions, statesValue, valuePattern } from "../lib/drift/match";

const fact = (code: string) => {
  const f = SEED_FACTS.find((x) => x.code === code);
  if (!f) throw new Error(`missing ${code}`);
  return { ...f, id: `id-${code}` };
};
const F12 = fact("F-12"); // ₹449 serum price
const F31 = fact("F-31"); // ₹499 free-shipping threshold
const F30 = fact("F-30"); // 3–5 business days
const F15 = fact("F-15"); // 10% vitamin C
const F41 = fact("F-41"); // SPF 50
const F40 = fact("F-40"); // best-seller "approved"
const ctx = {
  rules: SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true })),
  terms: SEED_TERMS,
  facts: SEED_FACTS.map((f) => ({ ...f, id: `id-${f.code}` })),
  today: "2026-11-22",
};

// 1. Price normalisation: every written form of ₹449 next to a serum keyword is found.
for (const t of ["now ₹449", "now ₹ 449", "now Rs 449", "now Rs. 449", "now rs.449", "now INR 449", "now 449/-", "now 449 rupees", "now ₹449.00"]) {
  const m = findValueMentions(`Lumina Vitamin C Serum, ${t} for 30ml.`, F12);
  assert.equal(m.length, 1, `should find the old price in "${t}"`);
}
// …but not other numbers, other prices, or longer numbers.
for (const t of ["now ₹499", "now ₹4499", "now ₹1449", "save 449 points", "₹44.9"]) {
  assert.equal(findValueMentions(`Lumina Vitamin C Serum, ${t}.`, F12).length, 0, `should not match "${t}"`);
}
// Thousands separators.
assert.equal(findValueMentions("Night Cream gift box price ₹1,499.", { ...F12, value: "1499", subject: "Night Cream gift box" }).length, 1);
// 2. Keyword gating: ₹499 in a free-shipping sentence is F-31, but not a product price sentence.
assert.equal(findValueMentions("Free shipping on orders above ₹499.", F31).length, 1);
assert.equal(findValueMentions("Our new lipstick costs ₹499.", F31).length, 0, "₹499 with no shipping keyword is not F-31");
// 3. Percentages, SPF and day ranges.
assert.equal(findValueMentions("It has 10% vitamin C.", F15).length, 1);
assert.equal(findValueMentions("It has 10 percent vitamin C.", F15).length, 1);
assert.equal(findValueMentions("It has 100% vitamin C.", F15).length, 0);
assert.equal(findValueMentions("Lumina Sunscreen SPF50 protects all day.", F41).length, 1);
assert.equal(findValueMentions("Lumina Sunscreen SPF 30 protects all day.", F41).length, 0);
for (const t of ["3–5 business days", "3-5 days", "3 to 5 days"]) {
  assert.equal(findValueMentions(`Standard delivery takes ${t}.`, F30).length, 1, `range "${t}"`);
}
assert.equal(findValueMentions("Standard delivery takes 2–4 days.", F30).length, 0);
// Non-numeric facts aren't scannable (tracked via recorded usages only).
assert.equal(valuePattern(F40), null);
assert.equal(statesValue("best-selling", F40), true);
// 4. statesValue decides whether a recorded usage states the old value.
assert.equal(statesValue("₹449", F12), true);
assert.equal(statesValue("₹399", F12), false);
assert.equal(statesValue("3–5 business days", F30), true);
assert.equal(displayValue(F12), "₹449");
assert.deepEqual(contextSnippet("abc ₹449 def", "₹449"), { before: "abc ", match: "₹449", after: " def" });

// 5. The engine records a usage for correct content (no finding) and for wrong content (with a finding).
const ok = runDeterministicChecksWithUsages({ text: "Lumina Vitamin C Serum, now ₹449.", channel: "ad" }, ctx);
assert.equal(ok.findings.filter((f) => f.ruleCode === "C-03").length, 0);
assert.ok(ok.usages.some((u) => u.factCode === "F-12" && u.factId === "id-F-12" && u.matchedText === "₹449"));
const bad = runDeterministicChecksWithUsages({ text: "Lumina Vitamin C Serum, now ₹399.", channel: "ad" }, ctx);
assert.ok(bad.findings.some((f) => f.ruleCode === "C-03" && f.factCode === "F-12"));
assert.ok(bad.usages.some((u) => u.factCode === "F-12" && u.matchedText === "₹399"));
// Delivery days that match the fact are recorded too (previously they left no trace).
const del = runDeterministicChecksWithUsages({ text: "Standard delivery takes 3–5 business days.", channel: "email" }, ctx);
assert.equal(del.findings.length, 0);
assert.ok(del.usages.some((u) => u.factCode === "F-30"));
// Approved alternative wording and best-seller claims are recorded against their facts.
const alt = runDeterministicChecksWithUsages({ text: "Dermatologically tested. Our best-selling serum.", channel: "ad" }, ctx);
assert.ok(alt.usages.some((u) => u.factCode === "F-20"));
assert.ok(alt.usages.some((u) => u.factCode === "F-40"));
// Image text records usages as well.
const img = imageTextCheck("Lumina Vitamin C Serum\nnow just ₹449", "ad", ctx);
assert.ok(img.usages.some((u) => u.factCode === "F-12"));

// 6. The seeded approved posts are clean and each records the fact Drift will look for.
const expect: Record<string, string> = {
  "Vitamin C Serum price post (approved)": "F-12",
  "Free-shipping banner (approved)": "F-31",
  "Delivery FAQ email (approved)": "F-30",
  "Festive offer post (approved)": "F-32",
};
for (const p of SEED_APPROVED_POSTS) {
  const r = runDeterministicChecksWithUsages({ text: p.text, channel: p.channel }, ctx);
  assert.equal(r.findings.length, 0, `${p.title} should have no findings, got ${r.findings.map((f) => f.ruleCode).join(",")}`);
  assert.ok(r.usages.some((u) => u.factCode === expect[p.title]), `${p.title} should record ${expect[p.title]}`);
}

console.log("drift: all assertions passed");
