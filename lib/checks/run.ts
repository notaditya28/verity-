import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { runAiStage } from "./ai-stage";
import { loadPolicy } from "./context";
import { runDeterministicChecks } from "./deterministic";
import { redact } from "./redact";

/**
 * Runs the full check for one submission version and persists the check row, findings and an audit entry.
 * Order: deterministic rules (saved first, always) → retrieval + AI judgement (may fail on its own).
 * An AI failure never fails the check: it is marked partial and the UI offers a retry.
 */
export async function runCheck(submissionVersionId: string): Promise<{ checkId: string; findings: number }> {
  const db = getDb();
  const [row] = await db
    .select({ version: schema.submissionVersions, submission: schema.submissions })
    .from(schema.submissionVersions)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.submissionVersions.submissionId))
    .where(eq(schema.submissionVersions.id, submissionVersionId))
    .limit(1);
  if (!row) throw new Error("Submission version not found");
  const { version, submission } = row;

  const { ctx, policyVersion, orgName } = await loadPolicy(submission.orgId);
  const content = version.extractedText ? `${version.text}\n\n[Text read from the image]\n${version.extractedText}` : version.text;
  const { text: redactedContent, redactions } = redact(content);

  const [check] = await db
    .insert(schema.checks)
    .values({ submissionVersionId, policyVersionId: policyVersion.id, status: "running", aiStatus: "pending", redactions })
    .returning();

  let deterministicCount = 0;
  try {
    const drafts = runDeterministicChecks({ text: version.text, channel: submission.channel }, ctx);
    deterministicCount = drafts.length;
    if (drafts.length) await db.insert(schema.findings).values(drafts.map((d) => ({ ...d, checkId: check.id })));

    const ai = await runAiStage({
      orgId: submission.orgId,
      orgName,
      channel: submission.channel,
      goal: submission.goal,
      audience: submission.audience,
      cta: submission.cta,
      text: version.text,
      redactedContent,
      extractedText: version.extractedText,
      ctx,
      deterministic: drafts,
    });

    if (ai.status === "completed" && ai.findings.length) {
      await db.insert(schema.findings).values(ai.findings.map((d) => ({ ...d, checkId: check.id })));
    }
    await db
      .update(schema.checks)
      .set({
        status: ai.status === "failed" ? "partial" : "completed",
        aiStatus: ai.status,
        model: ai.status === "skipped" ? null : ai.model,
        promptVersion: ai.status === "skipped" ? null : ai.promptVersion,
        error: ai.status === "failed" ? ai.error : ai.status === "skipped" ? ai.reason : null,
        finishedAt: new Date(),
      })
      .where(eq(schema.checks.id, check.id));

    await db.insert(schema.auditLog).values({
      orgId: submission.orgId,
      actorRole: "system",
      action: ai.status === "failed" ? "check.partial" : "check.completed",
      entity: "submission",
      entityId: submission.id,
      details: {
        version: version.versionNumber,
        checkId: check.id,
        policyVersion: policyVersion.versionNumber,
        ruleFindings: drafts.length,
        ai:
          ai.status === "completed"
            ? { provider: "gemini", model: ai.model, promptVersion: ai.promptVersion, findings: ai.findings.length, validation: ai.stats, retrieved: ai.retrieved }
            : ai.status === "failed"
              ? { provider: "gemini", model: ai.model, status: "failed", error: ai.error }
              : { status: "skipped" },
        redactedBeforeAi: redactions,
      },
    });
    return { checkId: check.id, findings: drafts.length + (ai.status === "completed" ? ai.findings.length : 0) };
  } catch (err) {
    await db
      .update(schema.checks)
      .set({
        status: deterministicCount ? "partial" : "failed",
        aiStatus: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      })
      .where(eq(schema.checks.id, check.id));
    throw err;
  }
}
