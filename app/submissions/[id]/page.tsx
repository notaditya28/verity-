import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbError } from "@/components/db-error";
import { FindingCard } from "@/components/results/finding-card";
import { HighlightedText } from "@/components/results/highlighted-text";
import { overallStatus, SEV_RANK } from "@/components/results/severity";
import { StatusBadge } from "@/components/status-badge";
import { getSubmissionDetail } from "@/lib/queries";
import { uuidSchema } from "@/lib/validation";
import { RerunButton } from "./rerun-button";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let data: Awaited<ReturnType<typeof getSubmissionDetail>>;
  try {
    data = await getSubmissionDetail(id);
  } catch (err) {
    console.error(err);
    return <DbError what="this submission" />;
  }
  if (!data) notFound();
  const { submission, version, check, findings, rules } = data;

  const ruleByCode = new Map(rules.map((r) => [r.code, r]));
  // Show the fact as it was when this check ran (policy version), falling back to the current row.
  const factFor = (code: string | null) => {
    if (!code) return undefined;
    const rows = data!.facts.filter((f) => f.code === code);
    return rows.find((f) => check && f.policyVersionId === check.policyVersionId) ?? rows.find((f) => f.current) ?? rows[0];
  };

  const sorted = [...findings].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || (a.spanStart ?? 1e9) - (b.spanStart ?? 1e9));
  const counts = (["critical", "high", "medium", "low"] as const).map((s) => ({ s, n: findings.filter((f) => f.severity === s).length }));
  const status = overallStatus(findings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            <Link href="/submissions" className="hover:underline">Submissions</Link> / v{version?.versionNumber ?? 1}
          </p>
          <h1 className="text-2xl font-bold">{submission.title}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {submission.channel} · Goal: {submission.goal || "—"} · Audience: {submission.audience || "—"} · CTA: {submission.cta || "—"}
          </p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      {/* Summary */}
      <section aria-label="Check summary" className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <Badge variant={status.tone} className="px-3 py-1 text-sm">{status.label}</Badge>
        <p className="text-sm text-muted-foreground">{status.detail}</p>
        <div className="ml-auto flex flex-wrap gap-2">
          {counts.map(({ s, n }) => (
            <Badge key={s} variant={n ? s : "muted"}>
              {n} {s}
            </Badge>
          ))}
        </div>
        {check && (
          <p className="w-full text-xs text-muted-foreground">
            Checked {check.finishedAt ? check.finishedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "(running)"} · rule checks{" "}
            {check.status === "failed" ? "failed" : "done"} · AI checks {check.aiStatus}
            {check.redactions.length > 0 && ` · redacted before AI: ${check.redactions.map((r) => `${r.count} ${r.type}`).join(", ")}`}
          </p>
        )}
      </section>

      {(!check || check.status === "failed") && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {check?.error ? `The check failed: ${check.error}` : "This version has not been checked yet."}
          {version && <RerunButton versionId={version.id} />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="content-h" className="space-y-2">
          <h2 id="content-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Content</h2>
          <HighlightedText text={version?.text ?? ""} findings={findings} />
          {version?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={version.imageUrl} alt={version.altText ?? "Submitted image (no alt text provided)"} className="max-h-80 rounded-lg border" />
          )}
          <p className="text-xs text-muted-foreground">Highlight colour shows severity: blue low, amber medium, orange high, red critical.</p>
        </section>

        <section aria-labelledby="findings-h" className="space-y-3">
          <h2 id="findings-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Findings ({findings.length})
          </h2>
          {check && findings.length === 0 && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">No issues found against the current brand policy.</p>
          )}
          {sorted.map((f) => (
            <FindingCard key={f.id} finding={f} rule={f.ruleCode ? ruleByCode.get(f.ruleCode) : undefined} fact={factFor(f.factCode)} />
          ))}
        </section>
      </div>
    </div>
  );
}
