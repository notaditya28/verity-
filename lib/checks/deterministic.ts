// Deterministic (no-LLM) checks. Pure functions: same input + context → same findings.
import { factEvidence, factValueDisplay, isFactValid, ruleEvidence } from "./format";
import type { CheckContext, CheckInput, DraftFinding, DraftUsage, EngineFact, EngineRule } from "./types";

interface Hit {
  start: number;
  end: number;
  quote: string;
}

// ---------- helpers ----------
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hits(text: string, pattern: string | RegExp, flags = "gi"): Hit[] {
  const re = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
  const out: Hit[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || m[0].length === 0) continue;
    out.push({ start: m.index, end: m.index + m[0].length, quote: m[0] });
  }
  return out;
}

/** Keeps the first-claimed span on overlap, so earlier (more specific) patterns win. */
class Claims {
  private spans: [number, number][] = [];
  claim(h: Hit): boolean {
    if (this.spans.some(([s, e]) => h.start < e && s < h.end)) return false;
    this.spans.push([h.start, h.end]);
    return true;
  }
}

/** Match the capitalisation of the original's first letter. */
function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  const first = original.trim()[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function strParams(rule: EngineRule, key: string): string[] {
  const v = rule.params[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function strParam(rule: EngineRule, key: string): string | undefined {
  const v = rule.params[key];
  return typeof v === "string" ? v : undefined;
}

function numParam(rule: EngineRule, key: string, fallback: number): number {
  const v = rule.params[key];
  return typeof v === "number" ? v : fallback;
}

function base(rule: EngineRule, h: Hit | null): Omit<DraftFinding, "explanation" | "suggestedFix"> {
  return {
    ruleCode: rule.code,
    factCode: null,
    source: "rule",
    category: rule.category,
    severity: rule.severity,
    label: null,
    spanStart: h ? h.start : null,
    spanEnd: h ? h.end : null,
    quote: h ? h.quote : null,
    evidence: ruleEvidence(rule),
    confidence: 1,
  };
}

/** Records that the content relied on a fact (whether or not it matched). Used by Fact Drift. */
function used(u: DraftUsage[], fact: EngineFact | undefined, h: Hit) {
  if (!fact) return;
  u.push({ factCode: fact.code, factId: fact.id ?? null, matchedText: h.quote, spanStart: h.start, spanEnd: h.end });
}

function show(q: string) {
  return `“${q.trim()}”`;
}

// ---------- terminology (T-03, T-04, TERM-01 via the terms table) ----------
function checkTerms(text: string, ctx: CheckContext, rule: (c: string) => EngineRule | undefined): DraftFinding[] {
  const out: DraftFinding[] = [];
  const byRule = new Map<string, typeof ctx.terms>();
  for (const t of ctx.terms) byRule.set(t.ruleCode, [...(byRule.get(t.ruleCode) ?? []), t]);

  for (const [code, terms] of byRule) {
    const r = rule(code);
    if (!r) continue;
    const found: (Hit & { preferred: string; banned: string })[] = [];
    for (const t of terms) {
      const preferred = t.preferred ?? "";
      const words = preferred.toLowerCase().split(/\s+/).filter(Boolean);
      for (const h of hits(text, `(?<![\\w-])${escapeRegex(t.banned)}(?![\\w-])`)) {
        let { start, end } = h;
        // Absorb neighbouring words that already belong to the preferred term
        // ("Lumina VitC serum" → one span → "Lumina Vitamin C Serum").
        const left = /([\w-]+)\s+$/.exec(text.slice(0, start));
        if (left && words.includes(left[1].toLowerCase()) && !t.banned.toLowerCase().includes(left[1].toLowerCase())) {
          start -= left[0].length;
        }
        const right = /^\s+([\w-]+)/.exec(text.slice(end));
        if (right && words.includes(right[1].toLowerCase()) && !t.banned.toLowerCase().includes(right[1].toLowerCase())) {
          end += right[0].length;
        }
        found.push({ start, end, quote: text.slice(start, end), preferred, banned: t.banned });
      }
    }
    // Merge overlapping hits into one span
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: typeof found = [];
    for (const f of found) {
      const last = merged[merged.length - 1];
      if (last && f.start < last.end) {
        last.end = Math.max(last.end, f.end);
        last.quote = text.slice(last.start, last.end);
      } else merged.push({ ...f });
    }
    for (const m of merged) {
      const fix = code === "TERM-01" ? m.preferred : matchCase(m.quote, m.preferred);
      out.push({
        ...base(r, m),
        explanation: `${show(m.quote)} is not approved wording. Use “${m.preferred}” instead.`,
        suggestedFix: fix,
      });
    }
  }
  return out;
}

// ---------- tone (T-02) ----------
function toneReplacement(quote: string): string {
  const q = quote.trim().toLowerCase();
  if (q.startsWith("omg")) return "";
  if (/^!+$/.test(q)) return "!";
  if (q.startsWith("insane")) return matchCase(quote, q.endsWith("ly") ? "remarkably" : "remarkable");
  if (q === "crazy") return matchCase(quote, "remarkable");
  if (q === "obsessed") return matchCase(quote, "delighted");
  if (q.startsWith("slay")) return matchCase(quote, "shine");
  return "";
}

function checkTone(text: string, r: EngineRule): DraftFinding[] {
  const out: DraftFinding[] = [];
  const claims = new Claims();
  for (const p of strParams(r, "patterns")) {
    for (const h of hits(text, p)) {
      if (!claims.claim(h)) continue;
      const fix = toneReplacement(h.quote);
      out.push({
        ...base(r, h),
        explanation: `${show(h.quote)} is slang or hype, which doesn't fit the brand voice.`,
        suggestedFix: fix,
      });
    }
  }
  const minLen = numParam(r, "allCapsMinLength", 4);
  const allow = new Set(strParams(r, "allCapsAllow"));
  for (const h of hits(text, new RegExp(`\\b[A-Z]{${minLen},}\\b`, "g"))) {
    if (allow.has(h.quote) || !claims.claim(h)) continue;
    out.push({
      ...base(r, h),
      explanation: `${show(h.quote)} is written in ALL CAPS, which reads as shouting.`,
      suggestedFix: h.quote[0] + h.quote.slice(1).toLowerCase(),
    });
  }
  return out;
}

// ---------- superlatives (C-01) ----------
function checkSuperlatives(text: string, r: EngineRule, ctx: CheckContext, u: DraftUsage[]): DraftFinding[] {
  const out: DraftFinding[] = [];
  const claims = new Claims();
  const factCode = strParam(r, "supportingFact");
  const fact = factCode ? ctx.facts.find((f) => f.code === factCode) : undefined;
  const factOk = !!fact && /^approved/i.test(fact.value) && isFactValid(fact, ctx.today);

  // Best-seller claims are fine only when the supporting fact is approved and in date.
  const bsp = strParam(r, "bestSellerPattern");
  if (bsp) {
    for (const h of hits(text, bsp)) {
      claims.claim(h);
      used(u, fact, h);
      if (factOk) continue;
      out.push({
        ...base(r, h),
        factCode: fact?.code ?? null,
        label: "unsupported",
        evidence: fact ? factEvidence(fact) : ruleEvidence(r),
        explanation: fact
          ? `${show(h.quote)} needs ${fact.code}, which is not approved or not currently valid.`
          : `${show(h.quote)} has no supporting fact in the Fact Registry.`,
        suggestedFix: matchCase(h.quote, "much-loved"),
      });
    }
  }

  const rank = strParam(r, "rankPattern");
  if (rank) {
    for (const h of hits(text, rank)) {
      if (!claims.claim(h)) continue;
      out.push({
        ...base(r, h),
        label: "unsupported",
        explanation: factOk
          ? `${show(h.quote)} is a ranking claim with no approved fact behind it. ${fact!.code} only approves “${fact!.attribute}”, so the fix uses that wording.`
          : `${show(h.quote)} is a ranking claim with no approved fact behind it.`,
        suggestedFix: matchCase(h.quote, factOk ? "our best-selling" : "our much-loved"),
      });
    }
  }

  for (const p of strParams(r, "patterns")) {
    for (const h of hits(text, p)) {
      if (!claims.claim(h)) continue;
      const q = h.quote.toLowerCase();
      const fix = q.startsWith("the best") ? "a much-loved" : q.includes("best") ? "much-loved" : q.startsWith("top") ? "popular" : "effective";
      out.push({
        ...base(r, h),
        label: "unsupported",
        explanation: `${show(h.quote)} is a superlative with no approved fact in the Fact Registry supporting it.`,
        suggestedFix: matchCase(h.quote, fix),
      });
    }
  }
  return out;
}

// ---------- guarantees (C-02) ----------
function guaranteeReplacement(quote: string): string {
  const q = quote.toLowerCase();
  if (q === "guaranteed") return matchCase(quote, "visible");
  if (q.startsWith("guarantee")) return matchCase(quote, q.endsWith("s") ? "helps" : "help");
  if (q.startsWith("100")) return q.includes("effective") ? "effective" : "visible results";
  if (q === "permanently") return "for longer";
  if (q.startsWith("permanent")) return matchCase(quote, "long-lasting");
  if (q.startsWith("overnight")) return matchCase(quote, "results with regular use");
  if (/^(in|within)\s/.test(q)) return "with regular use";
  return "";
}

function checkGuarantees(text: string, r: EngineRule): DraftFinding[] {
  const out: DraftFinding[] = [];
  const claims = new Claims();
  for (const p of strParams(r, "patterns")) {
    for (const h of hits(text, p)) {
      // "delivery in 3 days" is a delivery promise (M-01), not a results guarantee.
      if (/^(in|within)\s/i.test(h.quote) && /(deliver|ship|dispatch|arriv)\w*\W*$/i.test(text.slice(Math.max(0, h.start - 30), h.start))) continue;
      if (!claims.claim(h)) continue;
      out.push({
        ...base(r, h),
        label: "unsupported",
        explanation: /^(in|within)\s/i.test(h.quote)
          ? `${show(h.quote)} promises results in a fixed time. Results vary, so this is a guarantee.`
          : `${show(h.quote)} guarantees an outcome, which the brand cannot promise.`,
        suggestedFix: guaranteeReplacement(h.quote),
      });
    }
  }
  return out;
}

// ---------- prices and numbers (C-03) ----------
const STOP = new Set(["lumina", "price", "all", "products", "the", "and", "claim", "status", "own", "website", "threshold", "standard", "time", "concentration", "protection", "for"]);

function factKeywords(f: EngineFact): string[] {
  const words = `${f.subject} ${f.attribute}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (words.includes("shipping")) words.push("delivery");
  return [...new Set(words)];
}

function sentenceAround(text: string, idx: number): [number, number] {
  let s = idx;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  let e = idx;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  return [s, e];
}

/** Picks the fact a number refers to: most keyword hits in the same sentence, then nearest keyword in the text. */
function matchFact(text: string, at: number, candidates: EngineFact[]): { fact: EngineFact; confident: boolean } | null {
  if (candidates.length === 0) return null;
  const lower = text.toLowerCase();
  const [ss, se] = sentenceAround(text, at);
  const sentence = lower.slice(ss, se);
  let best: { fact: EngineFact; score: number; dist: number } | null = null;
  for (const f of candidates) {
    const kws = factKeywords(f);
    const score = kws.filter((k) => sentence.includes(k)).length;
    let dist = Infinity;
    for (const k of kws) {
      for (const m of lower.matchAll(new RegExp(`\\b${escapeRegex(k)}`, "g"))) {
        dist = Math.min(dist, Math.abs((m.index ?? 0) - at));
      }
    }
    if (!best || score > best.score || (score === best.score && dist < best.dist)) best = { fact: f, score, dist };
  }
  if (!best || (best.score === 0 && best.dist === Infinity)) return null;
  return { fact: best.fact, confident: best.score > 0 };
}

function numberFinding(
  r: EngineRule,
  h: Hit,
  stated: string,
  fact: EngineFact,
  confident: boolean,
  today: string,
  fix: string,
): DraftFinding | null {
  const valid = isFactValid(fact, today);
  const matches = parseFloat(stated) === parseFloat(fact.value.replace(/,/g, ""));
  if (matches && valid) return null;
  if (!valid) {
    return {
      ...base(r, h),
      factCode: fact.code,
      severity: "medium",
      label: "needs_human_verification",
      evidence: factEvidence(fact),
      explanation: `${show(h.quote)} relies on ${fact.code}, which is outside its valid period (${fact.validFrom} → ${fact.validUntil ?? "open"}). Confirm the current value with ${fact.owner}.`,
      suggestedFix: matches ? null : fix,
      confidence: 0.7,
    };
  }
  return {
    ...base(r, h),
    factCode: fact.code,
    label: confident ? "contradicted" : "needs_human_verification",
    severity: confident ? r.severity : "medium",
    evidence: factEvidence(fact),
    explanation: `States ${show(h.quote)}, but the approved ${fact.attribute} for ${fact.subject} is ${factValueDisplay(fact)} (${fact.code}).`,
    suggestedFix: fix,
    confidence: confident ? 1 : 0.6,
  };
}

function checkNumbers(text: string, r: EngineRule, ctx: CheckContext, u: DraftUsage[]): DraftFinding[] {
  const out: DraftFinding[] = [];
  const inrFacts = ctx.facts.filter((f) => f.unit === "INR");
  const thresholdFacts = inrFacts.filter((f) => /threshold/i.test(f.attribute));
  const priceFacts = inrFacts.filter((f) => !/threshold/i.test(f.attribute));

  for (const m of text.matchAll(/(?:₹|\brs\.?|\binr)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/gi)) {
    const h: Hit = { start: m.index!, end: m.index! + m[0].length, quote: m[0] };
    const stated = m[1].replace(/,/g, "");
    const before = text.slice(Math.max(0, h.start - 25), h.start);
    const isThreshold = /(above|over|orders?\s+(of|over|above)|min(imum)?|more than)\s*$/i.test(before);
    const match = matchFact(text, h.start, isThreshold ? thresholdFacts : priceFacts);
    if (!match) {
      out.push({
        ...base(r, h),
        severity: "medium",
        label: "needs_human_verification",
        explanation: `${show(h.quote)} is a price, but no matching fact was found in the Fact Registry.`,
        suggestedFix: "Confirm the price with the Pricing team, or remove it.",
        spanStart: null,
        spanEnd: null,
        confidence: 0.5,
      });
      continue;
    }
    used(u, match.fact, h);
    const f = numberFinding(r, h, stated, match.fact, match.confident, ctx.today, `₹${match.fact.value}`);
    if (f) out.push(f);
  }

  // Percentages next to a fact keyword (e.g. "15% vitamin C")
  const pctFacts = ctx.facts.filter((f) => f.unit === "%");
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) {
    const h: Hit = { start: m.index!, end: m.index! + m[0].length, quote: m[0] };
    const next = /^\s*([a-z]+)/i.exec(text.slice(h.end))?.[1]?.toLowerCase();
    const prev = /([a-z]+)\s*$/i.exec(text.slice(0, h.start))?.[1]?.toLowerCase();
    const fact = pctFacts.find((f) => factKeywords(f).some((k) => k === next || k === prev));
    if (!fact) continue;
    used(u, fact, h);
    const f = numberFinding(r, h, m[1], fact, true, ctx.today, `${fact.value}%`);
    if (f) out.push(f);
  }

  // SPF numbers vs facts whose value states an SPF
  const spfFacts = ctx.facts.filter((f) => /SPF\s?\d+/i.test(f.value));
  for (const m of text.matchAll(/\bSPF\s?(\d+)\b/gi)) {
    const h: Hit = { start: m.index!, end: m.index! + m[0].length, quote: m[0] };
    const fact = spfFacts[0];
    if (!fact) continue;
    used(u, fact, h);
    const factSpf = /SPF\s?(\d+)/i.exec(fact.value)![1];
    const f = numberFinding(r, h, m[1], { ...fact, value: factSpf }, true, ctx.today, `SPF ${factSpf}`);
    if (f) out.push({ ...f, evidence: factEvidence(fact) });
  }
  return out;
}

// ---------- "clinically proven" (C-04) ----------
function checkClinical(text: string, r: EngineRule, ctx: CheckContext, u: DraftUsage[]): DraftFinding[] {
  const out: DraftFinding[] = [];
  const fact = ctx.facts.find((f) => f.code === strParam(r, "factCode"));
  const alt = ctx.facts.find((f) => f.code === strParam(r, "alternativeFactCode"));
  const altPhrase = strParam(r, "alternative");
  // The approved alternative wording ("dermatologically tested") relies on its own fact.
  if (alt && altPhrase) for (const h of hits(text, `\\b${escapeRegex(altPhrase)}\\b`)) used(u, alt, h);
  for (const p of strParams(r, "patterns")) for (const h of hits(text, p)) used(u, fact, h);
  const approved = !!fact && /^approved/i.test(fact.value) && isFactValid(fact, ctx.today);
  if (approved) return out;
  const altOk = !!alt && /^approved/i.test(alt.value) && isFactValid(alt, ctx.today);
  const altText = strParam(r, "alternative") ?? "";
  for (const p of strParams(r, "patterns")) {
    for (const h of hits(text, p)) {
      out.push({
        ...base(r, h),
        factCode: fact?.code ?? null,
        label: "contradicted",
        evidence: fact ? factEvidence(fact) : ruleEvidence(r),
        explanation: fact
          ? `${show(h.quote)} needs an approved clinical study, but ${fact.code} says: ${fact.value}.${altOk ? ` ${alt!.code} approves “${altText}” instead.` : ""}`
          : `${show(h.quote)} needs an approved clinical-study fact, and none is on file.`,
        suggestedFix: altOk ? matchCase(h.quote, altText) : "",
      });
    }
  }
  return out;
}

// ---------- ASCI disclosure (ASCI-01) ----------
function checkDisclosure(text: string, channel: string, r: EngineRule): DraftFinding[] {
  if (!strParams(r, "channels").includes(channel)) return [];
  const lower = text.toLowerCase();
  const tags = strParams(r, "disclosures");
  if (tags.some((t) => new RegExp(`(?<![\\w#])${escapeRegex(t.toLowerCase())}(?![\\w])`).test(lower))) return [];
  return [
    {
      ...base(r, { start: 0, end: 0, quote: "" }),
      quote: null,
      label: null,
      explanation: `This ${channel} post has no paid-partnership disclosure. ASCI requires a clear label such as ${tags.slice(0, 3).join(", ")} upfront.`,
      suggestedFix: "#collab ",
    },
  ];
}

// ---------- medical claims (ASCI-02) ----------
function checkMedical(text: string, r: EngineRule): DraftFinding[] {
  const out: DraftFinding[] = [];
  const claims = new Claims();
  const conditions = (r.params.conditions ?? {}) as Record<string, string>;
  const condAlt = Object.keys(conditions).map(escapeRegex).join("|");
  const verbs = [...strParams(r, "alwaysVerbs"), ...strParams(r, "conditionVerbs")].map(escapeRegex).join("|");
  if (!condAlt || !verbs) return out;

  const helps = (verb: string) => {
    const v = verb.toLowerCase();
    if (/(ed)$/.test(v) || v.startsWith("got")) return "helped";
    if (/ing$/.test(v)) return "helping";
    if (/s$/.test(v.split(" ")[0])) return "helps";
    return "help";
  };

  const adjacent = new RegExp(`\\b(${verbs})\\s+(?:your\\s+|stubborn\\s+|all\\s+)?(${condAlt})\\b`, "gi");
  for (const m of text.matchAll(adjacent)) {
    const h: Hit = { start: m.index!, end: m.index! + m[0].length, quote: m[0] };
    if (!claims.claim(h)) continue;
    const softer = conditions[m[2].toLowerCase()] ?? "skin concerns";
    const look = softer.startsWith("the look") ? softer : `the look of ${softer}`;
    out.push({
      ...base(r, h),
      label: "unsupported",
      explanation: `${show(h.quote)} claims to cure or treat a medical condition. Cosmetics can't make treatment claims.`,
      suggestedFix: matchCase(h.quote, `${helps(m[1])} reduce ${look}`),
    });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${condAlt})\\s+(treatment|cure)\\b`, "gi"))) {
    const h: Hit = { start: m.index!, end: m.index! + m[0].length, quote: m[0] };
    if (!claims.claim(h)) continue;
    out.push({
      ...base(r, h),
      label: "unsupported",
      explanation: `${show(h.quote)} presents the product as a medical treatment.`,
      suggestedFix: matchCase(h.quote, `care for ${m[1].toLowerCase()}-prone skin`),
    });
  }
  const always = strParams(r, "alwaysVerbs").map(escapeRegex).join("|");
  if (always) {
    for (const h of hits(text, `\\b(?:${always})\\b`)) {
      if (!claims.claim(h)) continue;
      out.push({
        ...base(r, h),
        label: "unsupported",
        explanation: `${show(h.quote)} implies a medical cure, which cosmetics can't claim.`,
        suggestedFix: matchCase(h.quote, helps(h.quote)),
      });
    }
  }
  return out;
}

// ---------- delivery promises (M-01) ----------
function checkDelivery(text: string, r: EngineRule, ctx: CheckContext, u: DraftUsage[]): DraftFinding[] {
  const out: DraftFinding[] = [];
  const claims = new Claims();
  const fact = ctx.facts.find((f) => f.code === strParam(r, "factCode"));
  const approved = fact ? factValueDisplay(fact) : "the approved delivery time";
  const withFact = (h: Hit, explanation: string, fix: string): DraftFinding => ({
    ...base(r, h),
    factCode: fact?.code ?? null,
    label: "contradicted",
    evidence: fact ? factEvidence(fact) : ruleEvidence(r),
    explanation,
    suggestedFix: fix,
  });

  for (const p of strParams(r, "patterns")) {
    for (const h of hits(text, p)) {
      if (!claims.claim(h)) continue;
      const fix = /^delivered/i.test(h.quote) ? `delivered in ${approved}` : `delivery in ${approved}`;
      out.push(
        withFact(h, `${show(h.quote)} promises faster delivery than approved. Standard delivery is ${approved}${fact ? ` (${fact.code})` : ""}.`, matchCase(h.quote, fix)),
      );
    }
  }

  // Numeric delivery times ("delivery in 2 days") compared with the fact's range
  if (fact) {
    const [lo, hi] = fact.value.split(/[–-]/).map((x) => parseInt(x, 10));
    const re = /\b(?:deliver(?:y|ed)?|ship(?:ping|ped|s)?|dispatch(?:ed)?|arriv(?:e|es))\b[^.!?\n\d]{0,20}?(\d+)(?:\s?[–-]\s?(\d+))?\s*(?:business\s+|working\s+)?days?\b/gi;
    for (const m of text.matchAll(re)) {
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      const numStart = m.index! + m[0].indexOf(m[1]);
      const h: Hit = { start: numStart, end: m.index! + m[0].length, quote: text.slice(numStart, m.index! + m[0].length) };
      used(u, fact, h);
      if (a === lo && b === (hi || lo)) continue;
      if (!claims.claim(h)) continue;
      out.push(withFact(h, `${show(h.quote)} doesn't match the approved delivery time of ${approved} (${fact.code}).`, approved));
    }
  }
  return out;
}

// ---------- readability (A-03) ----------
function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return w.match(/[aeiouy]{1,2}/g)?.length ?? 1;
}

export function fleschScore(text: string): { score: number; words: number } {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)|\n+/g) ?? []).length);
  if (words.length === 0) return { score: 100, words: 0 };
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
  return { score: Math.round(score), words: words.length };
}

function checkReadability(text: string, r: EngineRule): DraftFinding[] {
  const { score, words } = fleschScore(text);
  if (words < numParam(r, "minWords", 25) || score >= numParam(r, "minScore", 50)) return [];
  return [
    {
      ...base(r, null),
      explanation: `Reading-ease score is ${score} (target ≥ ${numParam(r, "minScore", 50)}). Some sentences may be long or use complex words.`,
      suggestedFix: "Split long sentences and swap technical words for everyday ones.",
      confidence: 0.8,
    },
  ];
}

// ---------- entry point ----------
export function runDeterministicChecks(input: CheckInput, ctx: CheckContext): DraftFinding[] {
  return runDeterministicChecksWithUsages(input, ctx).findings;
}

/** Findings plus every fact the content relied on (correct or not), for Fact Drift. */
export function runDeterministicChecksWithUsages(input: CheckInput, ctx: CheckContext): { findings: DraftFinding[]; usages: DraftUsage[] } {
  const active = new Map(ctx.rules.filter((r) => r.active).map((r) => [r.code, r]));
  const rule = (c: string) => active.get(c);
  const text = input.text;
  const out: DraftFinding[] = [];
  const usages: DraftUsage[] = [];

  out.push(...checkTerms(text, ctx, rule));
  const run = (code: string, fn: (r: EngineRule) => DraftFinding[]) => {
    const r = rule(code);
    if (r) out.push(...fn(r));
  };
  run("T-02", (r) => checkTone(text, r));
  run("C-01", (r) => checkSuperlatives(text, r, ctx, usages));
  run("C-02", (r) => checkGuarantees(text, r));
  run("C-03", (r) => checkNumbers(text, r, ctx, usages));
  run("C-04", (r) => checkClinical(text, r, ctx, usages));
  run("ASCI-01", (r) => checkDisclosure(text, input.channel, r));
  run("ASCI-02", (r) => checkMedical(text, r));
  run("M-01", (r) => checkDelivery(text, r, ctx, usages));
  run("A-03", (r) => checkReadability(text, r));

  // One usage per fact + span (several rules can see the same number).
  const seen = new Set<string>();
  const uniq = usages.filter((x) => {
    const k = `${x.factCode}|${x.spanStart}|${x.spanEnd}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { findings: out.sort((a, b) => (a.spanStart ?? Infinity) - (b.spanStart ?? Infinity)), usages: uniq };
}
