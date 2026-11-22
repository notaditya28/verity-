// Guideline-gap insights: pure grouping and ranking over rows the database returns. Unit-tested offline.

/** One finding, deduplicated per submission (see queries.ts), with what happened to it. */
export interface InsightFinding {
  submissionId: string;
  title: string;
  channel: string;
  confidential: boolean;
  status: string; // submission status now
  ruleCode: string | null;
  factCode: string | null;
  source: "rule" | "ai";
  label: string | null;
  severity: string;
  quote: string | null;
  decision: "pending" | "accepted" | "edited" | "disputed";
  disputeReason: string | null;
  /** The manager's latest decision on the submission, if any. */
  managerDecision: "approve" | "request_changes" | "escalate" | null;
}

export interface Evidence {
  submissionId: string;
  title: string;
  confidential: boolean;
  quote: string | null;
  disputeReason: string | null;
  outcome: string; // plain words
}

export interface Gap {
  kind: "unclear_rule" | "uncovered_topic" | "missing_fact";
  key: string; // rule code, or topic / claim label
  headline: string;
  why: string; // the sentence, backed by the numbers
  score: number;
  metrics: Record<string, number>;
  evidence: Evidence[];
}

// ---------- text ----------
/** Lowercase, strip prices and numbers and punctuation, collapse spaces: "₹399, Reduces DARK spots by 30%!" → "reduces dark spots by". */
export function normalizeQuote(q: string): string {
  return q
    .toLowerCase()
    .replace(/(?:₹|\brs\.?|\binr)\s?\d[\d,]*(?:\.\d+)?/g, " ")
    .replace(/\d+(?:\.\d+)?\s?%?/g, " ")
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trigram set as pg_trgm builds it: each word (letters/digits) padded with two spaces before and one after. */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm similarity(): shared trigrams / all distinct trigrams. */
export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Greedy grouping: an item joins the first group whose first member is more similar than the threshold. */
export function groupBySimilarity<T>(items: T[], text: (t: T) => string, threshold = 0.5): T[][] {
  const groups: { rep: string; items: T[] }[] = [];
  for (const it of items) {
    const s = text(it);
    const g = groups.find((x) => similarity(x.rep, s) > threshold);
    if (g) g.items.push(it);
    else groups.push({ rep: s, items: [it] });
  }
  return groups.map((g) => g.items);
}

const STOP = new Set(["with", "your", "this", "that", "from", "have", "never", "made", "make", "only", "more", "their", "there", "about", "every", "skin", "lumina"]);
/** Topic words for uncovered claims: content words of 5+ letters (e.g. "vegan" is 5, "cruelty" 7). */
function topicWords(q: string): string[] {
  return normalizeQuote(q)
    .split(/[\s-]+/)
    .filter((w) => w.length >= 5 && !STOP.has(w));
}

// ---------- outcomes ----------
function outcome(f: InsightFinding): string {
  if (f.decision === "disputed") {
    if (f.managerDecision === "approve") return "Disputed; the manager approved anyway (sided with the creator)";
    if (f.managerDecision === "request_changes") return "Disputed; the manager requested changes (sided with the rule)";
    return "Disputed; not decided yet";
  }
  if (f.decision === "accepted" || f.decision === "edited") return "Fix accepted";
  return f.status === "approved" ? "Approved" : "Open";
}

function evidence(f: InsightFinding): Evidence {
  return { submissionId: f.submissionId, title: f.title, confidential: f.confidential, quote: f.quote, disputeReason: f.disputeReason, outcome: outcome(f) };
}

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

// ---------- the three gap kinds ----------
/** Rules creators dispute and managers overrule: "rule may be unclear or too strict". Needs ≥ 2 disputes. */
export function unclearRules(rows: InsightFinding[], ruleTitle: (code: string) => string): Gap[] {
  const byRule = new Map<string, InsightFinding[]>();
  for (const r of rows) if (r.ruleCode) byRule.set(r.ruleCode, [...(byRule.get(r.ruleCode) ?? []), r]);
  const out: Gap[] = [];
  for (const [code, list] of byRule) {
    const disputed = list.filter((f) => f.decision === "disputed");
    if (disputed.length < 2) continue;
    const withCreator = disputed.filter((f) => f.managerDecision === "approve").length;
    const withRule = disputed.filter((f) => f.managerDecision === "request_changes").length;
    const decided = withCreator + withRule;
    const rate = disputed.length / list.length;
    const creatorShare = decided ? withCreator / decided : 0;
    out.push({
      kind: "unclear_rule",
      key: code,
      headline: `${code} — ${ruleTitle(code)}: rule may be unclear or too strict`,
      why: `Disputed in ${disputed.length} of ${list.length} findings (${pct(disputed.length, list.length)}%). Managers sided with the creator in ${withCreator} of ${decided} decided disputes${decided ? ` (${pct(withCreator, decided)}%)` : ""}.`,
      score: disputed.length * rate * (1 + creatorShare),
      metrics: { findings: list.length, disputes: disputed.length, disputeRatePct: pct(disputed.length, list.length), sidedWithCreator: withCreator, sidedWithRule: withRule },
      evidence: disputed.map(evidence),
    });
  }
  return out;
}

/** AI findings that couldn't cite any rule or fact: "policy doesn't cover this", grouped by shared topic words. */
export function uncoveredTopics(rows: InsightFinding[], extraUncited = 0): Gap[] {
  const items = rows.filter((f) => f.source === "ai" && f.label === "needs_human_verification" && !f.ruleCode && !f.factCode && f.quote);
  const groups: { words: Map<string, number>; items: InsightFinding[] }[] = [];
  for (const f of items) {
    const ws = topicWords(f.quote!);
    const g = groups.find((x) => ws.some((w) => x.words.has(w)));
    if (g) {
      g.items.push(f);
      for (const w of ws) g.words.set(w, (g.words.get(w) ?? 0) + 1);
    } else groups.push({ words: new Map(ws.map((w) => [w, 1])), items: [f] });
  }
  return groups.map((g) => {
    const top = [...g.words.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([w]) => w);
    const subs = new Set(g.items.map((f) => f.submissionId)).size;
    return {
      kind: "uncovered_topic" as const,
      key: top.join(" / "),
      headline: `“${top.join(" / ")}” claims: no rule or fact covers this`,
      why: `${g.items.length} AI finding${g.items.length === 1 ? "" : "s"} in ${subs} submission${subs === 1 ? "" : "s"} could not cite any rule or fact, so they were downgraded to “needs human verification”.${extraUncited ? ` (${extraUncited} uncited AI items were downgraded across all checks.)` : ""}`,
      score: g.items.length * 1.0,
      metrics: { findings: g.items.length, submissions: subs },
      evidence: g.items.map(evidence),
    };
  });
}

/** Claims most often labelled unsupported, grouped by trigram similarity > 0.5: candidate new facts. */
export function missingFacts(rows: InsightFinding[]): Gap[] {
  const items = rows.filter((f) => f.label === "unsupported" && f.quote && (f.source === "ai" || f.ruleCode === "C-01"));
  return groupBySimilarity(items, (f) => normalizeQuote(f.quote!), 0.5)
    .filter((g) => g.length >= 2)
    .map((g) => {
      const label = normalizeQuote(g[0].quote!);
      const subs = new Set(g.map((f) => f.submissionId)).size;
      return {
        kind: "missing_fact" as const,
        key: label,
        headline: `“${label}…”: a claim with no approved fact`,
        why: `Labelled unsupported ${g.length} times in ${subs} submission${subs === 1 ? "" : "s"}. If it's true, add it to the Fact Registry with a source; if not, add a rule against it.`,
        score: g.length * 0.8,
        metrics: { findings: g.length, submissions: subs },
        evidence: g.map(evidence),
      };
    });
}

export function rankGaps(rows: InsightFinding[], ruleTitle: (code: string) => string, extraUncited = 0): Gap[] {
  return [...unclearRules(rows, ruleTitle), ...uncoveredTopics(rows, extraUncited), ...missingFacts(rows)].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

// ---------- repeated mistakes ----------
export interface FirstCheck {
  submissionId: string;
  channel: string;
  findings: number;
  ruleCodes: string[];
}

export function passRateByChannel(first: FirstCheck[]) {
  const by = new Map<string, { checked: number; passed: number; rules: Map<string, number> }>();
  for (const c of first) {
    const e = by.get(c.channel) ?? { checked: 0, passed: 0, rules: new Map() };
    e.checked++;
    if (c.findings === 0) e.passed++;
    for (const r of c.ruleCodes) e.rules.set(r, (e.rules.get(r) ?? 0) + 1);
    by.set(c.channel, e);
  }
  return [...by.entries()]
    .map(([channel, e]) => ({
      channel,
      checked: e.checked,
      passed: e.passed,
      passRatePct: pct(e.passed, e.checked),
      topRules: [...e.rules.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3),
    }))
    .sort((a, b) => b.checked - a.checked);
}
