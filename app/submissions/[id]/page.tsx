import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbError } from "@/components/db-error";
import { FindingCard } from "@/components/results/finding-card";
import { HighlightedText } from "@/components/results/highlighted-text";
import { overallStatus, SEV_RANK } from "@/components/results/severity";
import { VersionDiff } from "@/components/results/version-diff";
import { StatusBadge } from "@/components/status-badge";
import { isAutoApplicable } from "@/lib/checks/apply";
import { CreatorToolbar } from "@/components/workflow/creator-toolbar";
import { FindingActions } from "@/components/workflow/finding-actions";
import { ManagerPanel } from "@/components/workflow/manager-panel";
import { getSubmissionDetail } from "@/lib/queries";
import { getRole } from "@/lib/role";
import { uuidSchema } from "@/lib/validation";
import { RerunButton } from "./rerun-button";

export const dynamic = "force-dynamic";

const ACTION_TEXT = { approve: "Approved", request_changes: "Requested changes", escalate: "Escalated to Legal" } as const;

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let data: Awaited<ReturnType<typeof getSubmissionDetail>>;
  let role: Awaited<ReturnType<typeof getRole>>;
  try {
    [data, role] = await Promise.all([getSubmissionDetail(id), getRole()]);
  } catch (err) {
    console.error(err);
    return <DbError what="this submission" />;
  }
  if (!data) notFound();
  const { submission, versions, version, check, findings, rules, decisions } = data;
  const prevVersion = versions[1];

  const ruleByCode = new Map(rules.map((r) => [r.code, r]));
  // Show the fact as it was when this check ran (policy version), falling back to the current row.
  const factFor = (code: string | null) => {
    if (!code) return undefined;
    const rows = data!.facts.filter((f) => f.code === code);
    return rows.find((f) => check && f.policyVersionId === check.policyVersionId) ?? rows.find((f) => f.current) ?? rows[0];
  };

  const editable = submission.status === "draft" || submission.status === "changes_requested";
  const isCreator = role === "creator";
  const open = findings.filter((f) => f.creatorDecision === "pending");
  const sorted = [...findings].sort(
    (a, b) =>
      Number(a.creatorDecision !== "pending") - Number(b.creatorDecision !== "pending") ||
      SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
      (a.spanStart ?? 1e9) - (b.spanStart ?? 1e9),
  );
  const counts = (["critical", "high", "medium", "low"] as const).map((s) => ({ s, n: open.filter((f) => f.severity === s).length }));
  const status = overallStatus(open);
  const pendingFixable = open.filter(isAutoApplicable).length;
  const toApply = findings.filter(
    (f) =>
      (f.creatorDecision === "accepted" || f.creatorDecision === "edited") &&
      (f.spanStart !== null || f.ruleCode === "A-01") &&
      !!(f.creatorDecision === "edited" ? f.editedFix : f.suggestedFix)?.trim().length,
  ).length;
  const blockers = open.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const lastRequest = decisions.find((d) => d.action === "request_changes");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            <Link href={role === "manager" ? "/review" : "/submissions"} className="hover:underline">
              {role === "manager" ? "Review queue" : "Submissions"}
            </Link>{" "}
            / v{version?.versionNumber ?? 1}
            {versions.length > 1 && ` (of ${versions.length} versions)`}
          </p>
          <h1 className="text-2xl font-bold">{submission.title}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="capitalize">{submission.channel}</span> · Goal: {submission.goal || "—"} · Audience: {submission.audience || "—"} · CTA:{" "}
            {submission.cta || "—"}
          </p>
        </div>
        <StatusBadge status={submission.status} />
      </div>

      {submission.status === "changes_requested" && lastRequest && (
        <p role="status" className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950">
          <b>Manager requested changes:</b> {lastRequest.comment}
        </p>
      )}

      {/* Summary */}
      <section aria-label="Check summary" className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <Badge variant={status.tone} className="px-3 py-1 text-sm">
          {status.label}
        </Badge>
        <p className="text-sm text-muted-foreground">{status.detail}</p>
        <div className="ml-auto flex flex-wrap gap-2" aria-label="Open findings by severity">
          {counts.map(({ s, n }) => (
            <Badge key={s} variant={n ? s : "muted"}>
              {n} {s}
            </Badge>
          ))}
        </div>
        {check && (
          <p className="w-full text-xs text-muted-foreground">
            {open.length} open of {findings.length} findings · checked{" "}
            {check.finishedAt ? check.finishedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "(running)"} · rule checks{" "}
            {check.status === "failed" ? "failed" : "done"} · AI checks{" "}
            {check.aiStatus === "completed"
              ? `done (${check.model}, prompt ${check.promptVersion})`
              : check.aiStatus === "failed"
                ? "pending (retry below)"
                : check.aiStatus}
            {check.redactions.length > 0 && ` · redacted before AI: ${check.redactions.map((r) => `${r.count} ${r.type}`).join(", ")}`}
          </p>
        )}
      </section>

      {(!check || check.status === "failed") && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {check?.error ? `The check failed: ${check.error}` : "This version has not been checked yet."}
          {version && editable && <RerunButton versionId={version.id} />}
        </div>
      )}
      {check && check.status !== "failed" && check.aiStatus === "failed" && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>AI tone and claim checks didn’t finish{check.error ? ` (${check.error})` : ""}. Rule findings are shown below.</span>
          {version && editable && <RerunButton versionId={version.id} label="Retry AI checks" />}
        </div>
      )}
      {check && check.aiStatus === "skipped" && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          {check.error ?? "AI checks were skipped."} Only rule-based findings are shown.
        </p>
      )}

      {isCreator && editable && check && check.status !== "failed" && (
        <CreatorToolbar
          submissionId={submission.id}
          pendingFixable={pendingFixable}
          toApply={toApply}
          blockers={blockers}
          nextVersion={(version?.versionNumber ?? 1) + 1}
        />
      )}
      {isCreator && !editable && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          {submission.status === "approved"
            ? "Approved. This version is cleared for publication."
            : "This submission is with the reviewer. Switch to Manager in the header to review it."}
        </p>
      )}
      {role === "manager" && (submission.status === "in_review" || submission.status === "escalated") && (
        <ManagerPanel submissionId={submission.id} escalated={submission.status === "escalated"} />
      )}
      {role === "manager" && editable && (
        <p role="status" className="rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          This submission is with the creator ({submission.status === "draft" ? "draft" : "changes requested"}). It will appear in your queue once submitted.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="content-h" className="space-y-3">
          <h2 id="content-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Content (v{version?.versionNumber ?? 1})
          </h2>
          <HighlightedText text={version?.text ?? ""} findings={open} />
          {version?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={version.imageUrl} alt={version.altText ?? "Submitted image (no alt text provided)"} className="max-h-80 rounded-lg border" />
          )}
          {version?.imageUrl && (
            <details className="rounded-lg border p-3 text-sm" open>
              <summary className="cursor-pointer font-semibold">What Verity read from the image</summary>
              <dl className="mt-2 space-y-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alt text</dt>
                  <dd>{version.altText ?? <span className="text-muted-foreground">None provided</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text in the image (Gemini vision)</dt>
                  <dd className="whitespace-pre-wrap">
                    {version.extractedText === null ? (
                      <span className="text-muted-foreground">Not read yet (AI off or failed)</span>
                    ) : version.extractedText ? (
                      version.extractedText
                    ) : (
                      <span className="text-muted-foreground">No text found</span>
                    )}
                  </dd>
                </div>
                {version.visualDescription && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</dt>
                    <dd>{version.visualDescription}</dd>
                  </div>
                )}
                {!!version.imageAnalysis?.colours.length && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dominant colours</dt>
                    <dd className="mt-1 flex flex-wrap gap-2">
                      {version.imageAnalysis.colours.map((c) => (
                        <span key={c.hex} className="inline-flex items-center gap-1 text-xs">
                          <span className="h-4 w-4 rounded border" style={{ background: c.hex }} aria-hidden />
                          <span className="font-mono">{c.hex}</span> {Math.round(c.share * 100)}%
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </details>
          )}
          <p className="text-xs text-muted-foreground">Highlights show open findings. Colour shows severity: blue low, amber medium, orange high, red critical.</p>
          {prevVersion && version && (
            <VersionDiff from={prevVersion.text} to={version.text} fromLabel={`v${prevVersion.versionNumber}`} toLabel={`v${version.versionNumber}`} />
          )}
          {decisions.length > 0 && (
            <section aria-labelledby="history-h" className="space-y-2 rounded-lg border p-3">
              <h3 id="history-h" className="text-sm font-semibold">Review history</h3>
              <ul className="space-y-1 text-sm">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <b>{ACTION_TEXT[d.action]}</b> by {d.role} · {d.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {d.comment && <span className="text-muted-foreground"> · “{d.comment}”</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <section aria-labelledby="findings-h" className="space-y-3">
          <h2 id="findings-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Findings ({findings.length})
          </h2>
          {check && findings.length === 0 && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">No issues found against the current brand policy.</p>
          )}
          {sorted.map((f) => (
            <FindingCard key={f.id} finding={f} rule={f.ruleCode ? ruleByCode.get(f.ruleCode) : undefined} fact={factFor(f.factCode)}>
              {isCreator && editable && (
                <FindingActions
                  id={f.id}
                  decision={f.creatorDecision}
                  suggestedFix={f.suggestedFix}
                  editedFix={f.editedFix}
                  hasSpan={f.spanStart !== null && f.spanEnd !== null && f.spanEnd > f.spanStart}
                />
              )}
            </FindingCard>
          ))}
        </section>
      </div>
    </div>
  );
}
