// Confidential mode + AI-use log, tested with the AI client and the log intercepted (no network, no database).
// Usage: npx tsx --conditions=react-server scripts/test-confidential.ts
import assert from "node:assert/strict";
import { aiCall, ConfidentialAiError, setAiLogSink, setAiTransport, type AiCallRow, type AiRequest } from "../lib/ai/gateway";
import { insideWithheld, sanitizeForAi, withheldRanges } from "../lib/ai/sanitize";
import { runAiStage } from "../lib/checks/ai-stage";
import { runDeterministicChecks } from "../lib/checks/deterministic";
import { readImage } from "../lib/images/analyze";
import { SEED_FACTS, SEED_RULES, SEED_TERMS } from "../lib/demo/seed-data";

process.env.GEMINI_API_KEY ||= "test-key"; // geminiConfigured() → true; the transport is intercepted below
process.env.GEMINI_MODEL ||= "test-model";

const sent: AiRequest[] = [];
const logged: AiCallRow[] = [];
setAiTransport(async (req) => {
  sent.push(req);
  return { data: { findings: [] }, model: "test-model" };
});
setAiLogSink(async (row) => {
  logged.push(row);
});

const ctx = {
  rules: SEED_RULES.map((r) => ({ ...r, params: r.params ?? {}, active: true })),
  terms: SEED_TERMS,
  facts: SEED_FACTS.map((f) => ({ ...f, id: `id-${f.code}` })),
  today: "2026-11-22",
};
const everything = { retrieve: async () => ({ rules: ctx.rules, facts: ctx.facts, trace: [] }) };
const SENSITIVE = ["Project Aurora", "GlowMart"];

const results: string[] = [];
const ok = (msg: string) => {
  results.push(msg);
  console.log("  ✓", msg);
};

async function main() {
  // ---------- 1. Redaction patterns ----------
  const r = sanitizeForAi(
    "Mail priya.k@example.com, call +91 98765 43210 or 9876543210 or +91-98765-43210. Aadhaar 1234 5678 9012, PAN ABCDE1234F.",
  );
  const count = (t: string) => r.redactions.find((x) => x.type === t)?.count ?? 0;
  assert.equal(count("email"), 1);
  assert.equal(count("phone"), 3);
  assert.equal(count("aadhaar"), 1);
  assert.equal(count("pan"), 1);
  for (const leak of ["priya.k@example.com", "98765", "9876543210", "1234 5678 9012", "ABCDE1234F"]) assert.ok(!r.text.includes(leak), `leaked ${leak}`);
  ok("Emails, Indian phone numbers (+91 / 10-digit, with spaces or dashes), Aadhaar- and PAN-like IDs are masked");

  const s = sanitizeForAi("Our project aurora launch with GlowMart. PROJECT AURORA!", { sensitiveTerms: SENSITIVE });
  assert.equal(s.sensitiveTermsMasked, 3);
  assert.ok(!/aurora|glowmart/i.test(s.text));
  assert.equal(sanitizeForAi("Aurorae and GlowMartian", { sensitiveTerms: SENSITIVE }).sensitiveTermsMasked, 0, "whole words only");
  ok("Sensitive terms are masked case-insensitively, as whole words only");

  const text = "Intro. [[confidential]]Launch the Lumina Vitamin C Serum on 15 Dec at ₹399[[/confidential]] Outro.";
  const ranges = withheldRanges(text);
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0].start, ranges[0].end), "[[confidential]]Launch the Lumina Vitamin C Serum on 15 Dec at ₹399[[/confidential]]");
  const w = sanitizeForAi(text, { withheld: ranges.map((x) => x.inner) });
  assert.equal(w.withheldSections, 1);
  assert.ok(!w.text.includes("15 Dec") && !w.text.includes("399"));
  // Rule checks still see the full text, and their offsets match the original.
  const f = runDeterministicChecks({ text, channel: "ad" }, ctx).find((x) => x.quote === "₹399");
  assert.ok(f && text.slice(f.spanStart!, f.spanEnd!) === "₹399", "rule finding offsets map to the original text");
  assert.ok(insideWithheld(ranges, f!.spanStart, f!.spanEnd));
  ok("Withheld sections become [WITHHELD]; rule checks still run on the full text with correct offsets");

  // ---------- 2. (a) A confidential submission makes ZERO AI calls ----------
  sent.length = 0;
  logged.length = 0;
  const conf = await runAiStage({
    orgId: "org",
    orgName: "Lumina Skin",
    channel: "instagram",
    goal: "Tease the launch",
    audience: "Fans",
    cta: "Stay tuned",
    text: "Project Aurora launches 15 Dec.",
    redactedContent: "Project Aurora launches 15 Dec.",
    extractedText: null,
    ctx,
    deterministic: [],
    retriever: everything,
    confidential: true,
  });
  assert.equal(conf.status, "skipped");
  await assert.rejects(
    aiCall({ purpose: "judge", orgId: "org", promptVersion: "x", confidential: true, system: "s", prompt: "secret", schema: {}, timeoutMs: 1000 }),
    ConfidentialAiError,
  );
  await assert.rejects(readImage({ mimeType: "image/png", buffer: Buffer.from("x") }, { orgId: "org", confidential: true }), ConfidentialAiError);
  assert.equal(sent.length, 0, "no AI call may be made for confidential content");
  ok("Confidential submission: the judge stage is skipped, and the gateway refuses both judge and vision calls — 0 AI calls made");

  // ---------- 3. (b) Planted personal data, a withheld section and a sensitive term never reach the payload ----------
  sent.length = 0;
  logged.length = 0;
  const planted =
    "Meet Project Aurora, our new serum with GlowMart! [[confidential]]Launch on 15 Dec at ₹399[[/confidential]] " +
    "Questions? Mail priya.k@example.com or call +91 98765 43210. Aadhaar 1234 5678 9012.";
  const wr = withheldRanges(planted);
  const det = runDeterministicChecks({ text: planted, channel: "ad" }, ctx).map((d) =>
    insideWithheld(wr, d.spanStart, d.spanEnd) ? { ...d, quote: "[WITHHELD]" } : d,
  );
  const res = await runAiStage({
    orgId: "org",
    orgName: "Lumina Skin",
    channel: "ad",
    goal: "Launch Project Aurora",
    audience: "Customers",
    cta: "Shop now",
    text: planted,
    redactedContent: planted,
    extractedText: null,
    ctx,
    deterministic: det,
    retriever: everything,
    confidential: false,
    sensitiveTerms: SENSITIVE,
    withheld: wr.map((x) => x.inner),
  });
  assert.equal(res.status, "completed");
  assert.equal(sent.length, 1);
  const payload = `${sent[0].system}\n${sent[0].prompt}`;
  for (const leak of ["Project Aurora", "GlowMart", "15 Dec", "₹399", "priya.k@example.com", "98765", "1234 5678 9012", "[[confidential]]"]) {
    assert.ok(!payload.toLowerCase().includes(leak.toLowerCase()), `payload leaked "${leak}"`);
  }
  assert.ok(payload.includes("[WITHHELD]") && payload.includes("[SENSITIVE]") && payload.includes("[EMAIL]") && payload.includes("[PHONE]"));
  ok("Planted email, phone, Aadhaar, withheld section and sensitive terms are all absent from the payload sent to the AI");

  // The ai_calls row records the right counts — and never the payload.
  assert.equal(logged.length, 1);
  const row = logged[0];
  const rc = (t: string) => row.redactionCounts?.find((x) => x.type === t)?.count ?? 0;
  assert.equal(row.status, "ok");
  assert.equal(row.purpose, "judge");
  assert.equal(row.withheldSections, 1);
  assert.equal(row.sensitiveTermsMasked, 3, "Project Aurora in the content and in the goal, plus GlowMart");
  assert.equal(rc("email"), 1);
  assert.equal(rc("phone"), 1);
  assert.equal(rc("aadhaar"), 1);
  assert.equal(row.imageSent, false);
  assert.equal(row.charsSent, sent[0].system.length + sent[0].prompt.length);
  assert.match(row.payloadSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).includes("Aurora") && !JSON.stringify(row).includes("98765"), "the log row holds no content");
  ok(`ai_calls row: ${row.charsSent} chars sent, 1 email + 1 phone + 1 ID masked, 1 section withheld, 3 sensitive terms masked, SHA-256 only`);

  // ---------- 4. Errors are logged too ----------
  logged.length = 0;
  setAiTransport(async () => {
    throw new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand."}}');
  });
  const failed = await runAiStage({ ...{ orgId: "org", orgName: "L", channel: "ad", goal: "", audience: "", cta: "", text: "Hi", redactedContent: "Hi", extractedText: null, ctx, deterministic: [], retriever: everything } });
  assert.equal(failed.status, "failed");
  assert.equal(logged[0]?.status, "error");
  ok("A failed AI call is logged with status 'error' and a readable message");

  setAiTransport(null);
  setAiLogSink(null);
  console.log(`confidential: all assertions passed (${results.length} groups)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
