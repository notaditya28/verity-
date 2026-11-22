import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { runAiStage } from "./ai-stage";
import { loadPolicy } from "./context";
import { runDeterministicChecksWithUsages } from "./deterministic";
import { imageTextCheck, runImageChecks } from "./image-checks";
import type { DraftUsage } from "./types";
import { runImageStage } from "./image-stage";
import { redact } from "./redact";
import { VISION_PROMPT_VERSION } from "../prompts/vision";

/**
 * Runs the full check for one submission version and persists the check row, findings and an audit entry.
 * Order: image reading (once per version) → deterministic text, image-text and image rules (saved first, always)
 * → retrieval + AI judgement (may fail on its own).
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

  const { ctx, policyVersion, orgName, palette } = await loadPolicy(submission.orgId);
  const image = await runImageStage(version);
  const extractedText = image?.extractedText ?? null;
  const content = extractedText ? `${version.text}\n\n[Text read from the image]\n${extractedText}` : version.text;
  const { text: redactedContent, redactions } = redact(content);

  const [check] = await db
    .insert(schema.checks)
    .values({ submissionVersionId, policyVersionId: policyVersion.id, status: "running", aiStatus: "pending", redactions })
    .returning();

  let deterministicCount = 0;
  try {
    const body = version.text.trim() ? runDeterministicChecksWithUsages({ text: version.text, channel: submission.channel }, ctx) : { findings: [], usages: [] };
    const imgText = extractedText ? imageTextCheck(extractedText, submission.channel, ctx) : { findings: [], usages: [] };
    const drafts = [...body.findings, ...imgText.findings, ...(image ? runImageChecks(image.facts, ctx, palette) : [])];
    const usageRows = (list: DraftUsage[], source: "rule" | "ai" | "image_text") =>
      list.map((u) => ({
        orgId: submission.orgId,
        checkId: check.id,
        submissionId: submission.id,
        submissionVersionId: version.id,
        factCode: u.factCode,
        factId: u.factId,
        matchedText: u.matchedText,
        spanStart: u.spanStart,
        spanEnd: u.spanEnd,
        source,
      }));
    const ruleUsages = [...usageRows(body.usages, "rule"), ...usageRows(imgText.usages, "image_text")];
    if (ruleUsages.length) await db.insert(schema.factUsages).values(ruleUsages);
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
      extractedText,
      ctx,
      deterministic: drafts,
      // Image checks: vision (≤ 20 s) + judge (≤ 18 s) stays inside the 60 s function limit; typical total is ~15 s.
      timeoutMs: image?.readNow ? 18_000 : undefined,
    });
    // An image that couldn't be read counts as an AI failure: the page offers a retry, which re-reads it.
    const aiStatus = image?.error ? "failed" : ai.status;
    const aiError = [image?.error, ai.status === "failed" ? ai.error : null].filter(Boolean).join(" · ") || null;
    const skipNote = [ai.status === "skipped" ? ai.reason : null, image?.skippedReason].filter(Boolean).join(" ") || null;

    if (ai.status === "completed" && ai.findings.length) {
      await db.insert(schema.findings).values(ai.findings.map((d) => ({ ...d, checkId: check.id })));
    }
    if (ai.status === "completed" && ai.usages.length) await db.insert(schema.factUsages).values(usageRows(ai.usages, "ai"));
    await db
      .update(schema.checks)
      .set({
        status: aiStatus === "failed" ? "partial" : "completed",
        aiStatus,
        model: ai.status === "skipped" ? null : ai.model,
        promptVersion: ai.status === "skipped" ? null : image ? `${ai.promptVersion}+${VISION_PROMPT_VERSION}` : ai.promptVersion,
        error: aiStatus === "failed" ? aiError : skipNote,
        finishedAt: new Date(),
      })
      .where(eq(schema.checks.id, check.id));

    await db.insert(schema.auditLog).values({
      orgId: submission.orgId,
      actorRole: "system",
      action: aiStatus === "failed" ? "check.partial" : "check.completed",
      entity: "submission",
      entityId: submission.id,
      details: {
        version: version.versionNumber,
        checkId: check.id,
        policyVersion: policyVersion.versionNumber,
        ruleFindings: drafts.length,
        factUsages: { rule: body.usages.length, imageText: imgText.usages.length, ai: ai.status === "completed" ? ai.usages.length : 0 },
        image: image
          ? { readNow: image.readNow, textBlocks: image.facts.blocks.length, colours: image.facts.colours.length, error: image.error }
          : null,
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
