export interface ApplicableFix {
  spanStart: number | null;
  spanEnd: number | null;
  fix: string | null;
}

/**
 * Applies span fixes to text. Advice-only fixes (no span) are skipped, as are fixes that overlap
 * one already applied. Works from the end of the text backwards so earlier offsets stay valid.
 */
export function applyFixes(text: string, fixes: ApplicableFix[]): { text: string; applied: number; skipped: number } {
  const usable = fixes
    .filter((f): f is { spanStart: number; spanEnd: number; fix: string } => f.spanStart !== null && f.spanEnd !== null && f.fix !== null)
    // replacements before insertions at the same offset, so "#collab " lands in front of the fixed text
    .sort((a, b) => b.spanStart - a.spanStart || b.spanEnd - a.spanEnd);
  let out = text;
  let applied = 0;
  let skipped = fixes.length - usable.length;
  let floor = Infinity; // lowest start already edited
  for (const f of usable) {
    if (f.spanEnd > floor || (f.spanEnd === floor && f.spanStart !== f.spanEnd && f.spanStart === floor)) {
      skipped++;
      continue;
    }
    out = out.slice(0, f.spanStart) + f.fix + out.slice(f.spanEnd);
    floor = f.spanStart;
    applied++;
  }
  return { text: out.replace(/ {2,}/g, " ").replace(/^ +/gm, ""), applied, skipped };
}
