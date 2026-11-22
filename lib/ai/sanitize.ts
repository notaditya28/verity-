// Everything that leaves for a third-party AI passes through sanitizeForAi (applied by the AI gateway to the whole
// prompt, so content, brief fields and quotes of rule findings are all covered). Pure: unit-tested offline.
import { redact } from "../checks/redact";

/** Inline markers that keep part of a draft away from any AI: [[confidential]] … [[/confidential]]. */
const BLOCK = /\[\[\s*confidential\s*\]\]([\s\S]*?)\[\[\s*\/\s*confidential\s*\]\]/gi;

export interface WithheldRange {
  start: number; // offset of the opening marker in the original text
  end: number; // offset just after the closing marker
  inner: string;
}

/** Withheld sections with their offsets in the original text (rule checks use the original, so offsets match). */
export function withheldRanges(text: string): WithheldRange[] {
  const out: WithheldRange[] = [];
  for (const m of text.matchAll(BLOCK)) {
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, inner: m[1] });
  }
  return out;
}

export interface SanitizeCounts {
  redactions: { type: string; count: number }[];
  withheldSections: number;
  sensitiveTermsMasked: number;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Masks, in order: withheld blocks (and any literal copy of their text) → [WITHHELD]; sensitive terms →
 * [SENSITIVE] (case-insensitive, whole words); then personal data (emails, phones, Aadhaar/PAN-like IDs).
 */
export function sanitizeForAi(
  input: string,
  opts: { sensitiveTerms?: string[]; withheld?: string[] } = {},
): { text: string } & SanitizeCounts {
  let withheldSections = 0;
  let text = input.replace(BLOCK, () => {
    withheldSections++;
    return "[WITHHELD]";
  });
  // Literal copies (e.g. a rule finding quoting text from inside a withheld section).
  for (const w of [...new Set((opts.withheld ?? []).map((x) => x.trim()).filter((x) => x.length >= 3))].sort((a, b) => b.length - a.length)) {
    text = text.split(w).join("[WITHHELD]");
  }
  let sensitiveTermsMasked = 0;
  const terms = [...new Set((opts.sensitiveTerms ?? []).map((t) => t.trim()).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
  for (const t of terms) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t)}(?![\\p{L}\\p{N}])`, "giu");
    text = text.replace(re, () => {
      sensitiveTermsMasked++;
      return "[SENSITIVE]";
    });
  }
  const r = redact(text);
  return { text: r.text, redactions: r.redactions, withheldSections, sensitiveTermsMasked };
}

/** True when [start, end) lies inside a withheld section. */
export function insideWithheld(ranges: WithheldRange[], start: number | null, end: number | null): boolean {
  if (start === null || end === null) return false;
  return ranges.some((r) => start < r.end && end > r.start);
}
