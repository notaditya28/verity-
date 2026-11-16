import type { Finding } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { SEV_HIGHLIGHT, SEV_RANK } from "./severity";

type SpanFinding = Pick<Finding, "id" | "spanStart" | "spanEnd" | "severity" | "ruleCode" | "factCode">;

/** Renders text with finding spans highlighted; overlapping spans take the highest severity. */
export function HighlightedText({ text, findings }: { text: string; findings: SpanFinding[] }) {
  const spans = findings.filter(
    (f): f is SpanFinding & { spanStart: number; spanEnd: number } =>
      f.spanStart !== null && f.spanEnd !== null && f.spanEnd > f.spanStart && f.spanEnd <= text.length,
  );
  const cuts = new Set<number>([0, text.length]);
  for (const s of spans) {
    cuts.add(s.spanStart);
    cuts.add(s.spanEnd);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: { start: number; end: number; covering: typeof spans }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i], points[i + 1]];
    segments.push({ start, end, covering: spans.filter((s) => s.spanStart <= start && s.spanEnd >= end) });
  }
  const firstIdAt = new Map<number, string>();
  for (const s of spans) if (!firstIdAt.has(s.spanStart)) firstIdAt.set(s.spanStart, s.id);

  return (
    <div className="whitespace-pre-wrap break-words rounded-lg border bg-card p-4 text-[15px] leading-7">
      {segments.map((seg) => {
        const part = text.slice(seg.start, seg.end);
        if (seg.covering.length === 0) return <span key={seg.start}>{part}</span>;
        const top = seg.covering.reduce((a, b) => (SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a));
        const codes = seg.covering.map((c) => [c.ruleCode, c.factCode].filter(Boolean).join("/")).join(", ");
        return (
          <mark
            key={seg.start}
            id={firstIdAt.get(seg.start) ? `span-${firstIdAt.get(seg.start)}` : undefined}
            title={codes}
            className={cn("rounded px-0.5 text-inherit underline decoration-2 underline-offset-4", SEV_HIGHLIGHT[top.severity])}
          >
            {part}
          </mark>
        );
      })}
      {text.length === 0 && <span className="text-muted-foreground">(no text)</span>}
    </div>
  );
}
