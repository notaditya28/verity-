// Pure value matching for Fact Drift: does this content still state a fact's (old) value?
// Used by the fallback scan (content checked before usages were recorded) and by auto-resolution.
import type { EngineFact } from "../checks/types";

export interface ValueMention {
  matchedText: string;
  start: number;
  end: number;
}

const STOP = new Set(["lumina", "price", "all", "products", "the", "and", "claim", "status", "own", "website", "threshold", "standard", "time", "concentration", "protection", "for", "with", "approved"]);

/** Words that tie a mention to this fact (same idea as the rule engine's fact matching). */
export function factKeywords(f: Pick<EngineFact, "subject" | "attribute">): string[] {
  const words = `${f.subject} ${f.attribute}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  if (words.includes("shipping")) words.push("delivery", "ship");
  if (words.includes("delivery")) words.push("deliver", "ship", "dispatch");
  return [...new Set(words)];
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Number written with optional thousands separators: 1499 → "1,?499". */
function numPattern(n: string): string {
  const digits = n.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return esc(n);
  const [int, dec] = digits.split(".");
  const withSep = int.length > 3 ? `${int.slice(0, -3)},?${int.slice(-3)}` : int;
  return dec ? `${withSep}\\.${dec}` : `${withSep}(?:\\.0{1,2})?`;
}

/**
 * A regex that finds the fact's value as content would write it, or null when the value isn't a scannable number
 * (e.g. "approved" — those facts are tracked through recorded usages only).
 */
export function valuePattern(f: Pick<EngineFact, "value" | "unit">): RegExp | null {
  const v = f.value.trim();
  if (f.unit === "INR") {
    const n = numPattern(v);
    // ₹449 · Rs 449 · Rs. 449 · INR 449 · 449/- · 449 rupees
    return new RegExp(`(?:₹\\s?|\\brs\\.?\\s?|\\binr\\s?)${n}(?!\\d)|(?<![\\d.,])${n}\\s?(?:/-|rupees\\b)`, "gi");
  }
  if (f.unit === "%") return new RegExp(`(?<![\\d.])${numPattern(v)}\\s?(?:%|percent\\b)`, "gi");
  const spf = /SPF\s?(\d+)/i.exec(v);
  if (spf) return new RegExp(`\\bSPF\\s?${spf[1]}(?!\\d)`, "gi");
  const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(v);
  if (range) return new RegExp(`(?<!\\d)${range[1]}\\s?(?:[–-]|to)\\s?${range[2]}(?!\\d)`, "gi");
  if (/^\d+(\.\d+)?$/.test(v)) return new RegExp(`(?<![\\d.])${numPattern(v)}(?!\\d)`, "g");
  return null;
}

function sentenceAround(text: string, start: number, end: number): string {
  let s = start;
  while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
  let e = end;
  while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
  return text.slice(s, e).toLowerCase();
}

/**
 * Mentions of the fact's value that are tied to the fact by a keyword in the same sentence (or within 60 chars),
 * so "₹499" for free shipping isn't confused with a ₹499 product price.
 */
export function findValueMentions(text: string, f: Pick<EngineFact, "value" | "unit" | "subject" | "attribute">): ValueMention[] {
  const re = valuePattern(f);
  if (!re || !text) return [];
  const kws = factKeywords(f);
  const out: ValueMention[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const sentence = sentenceAround(text, start, end);
    const near = text.slice(Math.max(0, start - 60), Math.min(text.length, end + 60)).toLowerCase();
    if (kws.length && !kws.some((k) => sentence.includes(k) || near.includes(k))) continue;
    out.push({ matchedText: m[0], start, end });
  }
  return out;
}

/** True when a recorded usage's text states exactly this fact value (used to decide drift and resolution). */
export function statesValue(matchedText: string, f: Pick<EngineFact, "value" | "unit">): boolean {
  const re = valuePattern(f);
  if (!re) return true; // non-numeric facts (e.g. "approved" claims): any usage counts
  re.lastIndex = 0;
  return re.test(matchedText);
}

/** A display form of a fact value: ₹449, 10%, 3–5 business days. */
export function displayValue(f: Pick<EngineFact, "value" | "unit">): string {
  if (f.unit === "INR") return `₹${f.value}`;
  if (f.unit === "%") return `${f.value}%`;
  return f.unit ? `${f.value} ${f.unit}` : f.value;
}

/** ~120 characters of context around a match, with ellipses. */
export function contextSnippet(text: string, matched: string, radius = 60): { before: string; match: string; after: string } | null {
  const i = text.indexOf(matched);
  if (i < 0) return null;
  const s = Math.max(0, i - radius);
  const e = Math.min(text.length, i + matched.length + radius);
  return {
    before: (s > 0 ? "…" : "") + text.slice(s, i),
    match: matched,
    after: text.slice(i + matched.length, e) + (e < text.length ? "…" : ""),
  };
}
