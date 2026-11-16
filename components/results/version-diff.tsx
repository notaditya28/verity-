import { wordDiff } from "@/lib/diff";

export function VersionDiff({ from, to, fromLabel, toLabel }: { from: string; to: string; fromLabel: string; toLabel: string }) {
  const parts = wordDiff(from, to);
  return (
    <details className="rounded-lg border p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">
        Changes {fromLabel} → {toLabel}
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
        {parts.map((p, i) =>
          p.type === "same" ? (
            <span key={i}>{p.text}</span>
          ) : p.type === "add" ? (
            <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900 no-underline">
              {p.text}
            </ins>
          ) : (
            <del key={i} className="rounded bg-red-50 px-0.5 text-red-900">
              {p.text}
            </del>
          ),
        )}
      </div>
    </details>
  );
}
