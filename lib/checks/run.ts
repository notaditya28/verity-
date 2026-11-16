import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { loadPolicy } from "./context";
import { runDeterministicChecks } from "./deterministic";
import { redact } from "./redact";

/**
 * Runs the full check for one submission version and persists the check row, findings and an audit entry.
 * Deterministic findings are always saved; the AI stage (M3) is layered on top and may fail on its own.
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

  const { ctx, policyVersion } = await loadPolicy(submission.orgId);
  const { redactions } = redact(`${version.text}\n${version.extractedText ?? ""}`);

  const [check] = await db
    .insert(schema.checks)
    .values({
      submissionVersionId,
      policyVersionId: policyVersion.id,
      status: "running",
      aiStatus: "skipped",
      redactions,
    })
    .returning();

  try {
    const drafts = runDeterministicChecks({ text: version.text, channel: submission.channel }, ctx);
    if (drafts.length) {
      await db.insert(schema.findings).values(drafts.map((d) => ({ ...d, checkId: check.id })));
    }
    await db
      .update(schema.checks)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(schema.checks.id, check.id));
    await db.insert(schema.auditLog).values({
      orgId: submission.orgId,
      actorRole: "system",
      action: "check.completed",
      entity: "submission",
      entityId: submission.id,
      details: {
        version: version.versionNumber,
        checkId: check.id,
        policyVersion: policyVersion.versionNumber,
        ruleFindings: drafts.length,
        redactions,
      },
    });
    return { checkId: check.id, findings: drafts.length };
  } catch (err) {
    await db
      .update(schema.checks)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(schema.checks.id, check.id));
    throw err;
  }
}
