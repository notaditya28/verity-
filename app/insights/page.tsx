import Link from "next/link";
import { CircleHelp, FileQuestion, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbError } from "@/components/db-error";
import { ConfidentialBadge } from "@/components/flags";
import { loadInsights } from "@/lib/insights/queries";
import type { Gap } from "@/lib/insights/rank";
import { getRole } from "@/lib/role";
import { GapActions } from "./gap-actions";

export const dynamic = "force-dynamic";

const KIND: Record<Gap["kind"], { label: string; icon: typeof Lightbulb; tone: string }> = {
  unclear_rule: { label: "Rule may be unclear or too strict", icon: CircleHelp, tone: "text-orange-700" },
  uncovered_topic: { label: "Policy doesn't cover this", icon: FileQuestion, tone: "text-violet-700" },
  missing_fact: { label: "Candidate new fact", icon: Lightbulb, tone: "text-sky-700" },
};

export default async function InsightsPage() {
  let data: Awaited<ReturnType<typeof loadInsights>>;
  const isManager = (await getRole()) === "manager";
  try {
    data = await loadInsights();
  } catch (err) {
    console.error(err);
    return <DbError what="guideline insights" />;
  }
  const { gaps, kpis, byChannel, currentRules } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Guideline insights</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Where the guidelines seem unclear, missing or keep causing the same mistakes — computed from real review data: findings, creators&apos;
          disputes and managers&apos; decisions. Seeded demo history is fictional; your own checks update these numbers live.
        </p>
      </div>

      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: kpis.submissionsChecked, label: "submissions checked" },
          { n: `${kpis.firstCheckPassRatePct}%`, label: "first-check pass rate", sub: `${kpis.firstCheckPassed} of ${kpis.submissionsChecked} had no findings on their first check` },
          { n: kpis.openDisputes, label: "open disputes", sub: "disputed findings on submissions not yet approved" },
          { n: kpis.uncoveredTopics, label: "uncovered topics", sub: "claims no rule or fact covers" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{k.n}</div>
            <div className="text-sm font-medium">{k.label}</div>
            {k.sub && <div className="text-xs text-muted-foreground">{k.sub}</div>}
          </div>
        ))}
      </section>

      <section aria-labelledby="gaps-h" className="space-y-3">
        <h2 id="gaps-h" className="text-lg font-semibold">Guideline gaps, ranked</h2>
        {gaps.length === 0 && <p className="rounded-lg border p-6 text-sm text-muted-foreground">No gaps yet. They appear once findings are disputed or AI can&apos;t cite a rule.</p>}
        <ol className="space-y-3">
          {gaps.map((g, i) => {
            const K = KIND[g.kind];
            const rule = g.kind === "unclear_rule" ? currentRules.get(g.key) : undefined;
            return (
              <li key={`${g.kind}-${g.key}`} id={`gap-${g.key}`} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${K.tone}`}>
                      <K.icon className="h-3.5 w-3.5" aria-hidden /> {K.label}
                    </p>
                    <h3 className="font-semibold">{g.headline}</h3>
                    <p className="text-sm">{g.why}</p>
                    {rule && <p className="text-xs text-muted-foreground">Current wording: {rule.description}</p>}
                  </div>
                </div>
                <details className="rounded-md bg-muted/60 p-3 text-sm" open={i === 0}>
                  <summary className="cursor-pointer font-medium">Evidence ({g.evidence.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {g.evidence.map((e, j) => (
                      <li key={j} className="space-y-0.5">
                        <Link href={`/submissions/${e.submissionId}`} className="font-medium hover:underline">{e.title}</Link>
                        {e.confidential && <ConfidentialBadge className="ml-1" />}
                        <p>
                          {e.quote && <>“{e.quote.trim()}” · </>}
                          <span className="text-muted-foreground">{e.outcome}</span>
                        </p>
                        {e.disputeReason && <p className="text-muted-foreground">Creator: “{e.disputeReason}”</p>}
                      </li>
                    ))}
                  </ul>
                </details>
                {isManager ? (
                  <GapActions kind={g.kind} gapKey={g.key} rule={rule ? { title: rule.title, description: rule.description } : undefined} />
                ) : (
                  <p className="text-xs text-muted-foreground">Switch to Manager in the header to draft a clarification or edit the rule.</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="mistakes-h" className="space-y-3">
        <h2 id="mistakes-h" className="text-lg font-semibold">Repeated mistakes by channel</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2 text-right">Checked</th>
                <th className="px-3 py-2 text-right">First-check pass rate</th>
                <th className="px-3 py-2">Rules triggered most (first checks)</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.map((c) => (
                <tr key={c.channel} className="border-t">
                  <td className="px-3 py-2 capitalize">{c.channel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.checked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.passRatePct}% <span className="text-xs text-muted-foreground">({c.passed}/{c.checked})</span></td>
                  <td className="px-3 py-2">
                    {c.topRules.length ? c.topRules.map(([code, n]) => <Badge key={code} variant="muted" className="mr-1">{code} × {n}</Badge>) : <span className="text-muted-foreground">none</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
