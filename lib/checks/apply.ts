export interface ApplicableFix {
  spanStart: number | null;
  spanEnd: number | null;
  fix: string | null;
}

/**
 * Applies span fixes to text. Advice-only fixes (no span) are skipped. Overlaps are resolved in the given
 * order (first one wins), then fixes are applied from the end of the text backwards so offsets stay valid.
 */
export function applyFixes(text: string, fixes: ApplicableFix[]): { text: string; applied: number; skipped: number } {
  const usable = fixes.filter(
    (f): f is { spanStart: number; spanEnd: number; fix: string } =>
      f.spanStart !== null && f.spanEnd !== null && f.fix !== null && f.spanStart <= f.spanEnd && f.spanEnd <= text.length,
  );
  let skipped = fixes.length - usable.length;

  const chosen: typeof usable = [];
  for (const f of usable) {
    const clash = chosen.some((c) => {
      const fIns = f.spanStart === f.spanEnd;
      const cIns = c.spanStart === c.spanEnd;
      if (fIns && cIns) return f.spanStart === c.spanStart;
      if (fIns) return f.spanStart > c.spanStart && f.spanStart < c.spanEnd;
      if (cIns) return c.spanStart > f.spanStart && c.spanStart < f.spanEnd;
      return f.spanStart < c.spanEnd && c.spanStart < f.spanEnd;
    });
    if (clash) skipped++;
    else chosen.push(f);
  }

  // Back to front; at the same offset apply the replacement before the insertion so the insertion lands in front.
  chosen.sort((a, b) => b.spanStart - a.spanStart || b.spanEnd - a.spanEnd);
  let out = text;
  for (const f of chosen) out = out.slice(0, f.spanStart) + f.fix + out.slice(f.spanEnd);
  return { text: out.replace(/ {2,}/g, " ").replace(/^ +/gm, ""), applied: chosen.length, skipped };
}
