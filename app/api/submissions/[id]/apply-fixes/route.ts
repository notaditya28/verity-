import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { applyFixes } from "@/lib/checks/apply";
import { runCheck } from "@/lib/checks/run";
import { uuidSchema } from "@/lib/validation";
import { applicableFixes, audit, EDITABLE_STATUSES, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Applies accepted/edited fixes → new version → re-runs the check. Disputes carry over to matching new findings. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("creator");
  if (denied) return denied;

  try {
    const data = await loadLatest(id);
    if (!data) return jsonError("Submission not found", 404);
    const { submission, version, findings } = data;
    if (!(EDITABLE_STATUSES as readonly string[]).includes(submission.status)) {
      return jsonError("This submission is with the reviewer and can't be changed right now.", 409);
    }
    const fixes = applicableFixes(findings);
    if (fixes.length === 0) return jsonError("Accept or edit at least one fix first.", 400);
    const result = applyFixes(version.text, fixes);
    if (result.text === version.text) return jsonError("The accepted fixes don't change the text.", 400);

    const db = getDb();
    const nextNumber = version.versionNumber + 1;
    const [newVersion] = await db
      .insert(schema.submissionVersions)
      .values({
        submissionId: id,
        versionNumber: nextNumber,
        text: result.text,
        imageUrl: version.imageUrl,
        altText: version.altText,
        extractedText: version.extractedText,
        visualDescription: version.visualDescription,
      })
      .returning();
    await db
      .update(schema.submissions)
      .set({ currentVersion: nextNumber, status: "draft", updatedAt: new Date() })
      .where(eq(schema.submissions.id, id));
    await audit("creator", "version.created", "submission", id, {
      from: version.versionNumber,
      to: nextNumber,
      appliedFixes: result.applied,
      skippedFixes: result.skipped,
    });

    let checkError: string | null = null;
    try {
      await runCheck(newVersion.id);
    } catch (err) {
      checkError = err instanceof Error ? err.message : String(err);
    }

    // Carry disputes forward: a dispute on the same rule/fact and same quote stays disputed in the new version.
    const disputed = findings.filter((f) => f.creatorDecision === "disputed");
    if (disputed.length && !checkError) {
      const [newCheck] = await db
        .select()
        .from(schema.checks)
        .where(eq(schema.checks.submissionVersionId, newVersion.id))
        .orderBy(desc(schema.checks.startedAt))
        .limit(1);
      if (newCheck) {
        const fresh = await db.select().from(schema.findings).where(and(eq(schema.findings.checkId, newCheck.id), eq(schema.findings.creatorDecision, "pending")));
        for (const f of fresh) {
          const prev = disputed.find((d) => d.ruleCode === f.ruleCode && d.factCode === f.factCode && (d.quote ?? "").trim() === (f.quote ?? "").trim());
          if (prev) {
            await db.update(schema.findings).set({ creatorDecision: "disputed", disputeReason: prev.disputeReason }).where(eq(schema.findings.id, f.id));
          }
        }
      }
    }

    return NextResponse.json({ versionNumber: nextNumber, applied: result.applied, skipped: result.skipped, checkError });
  } catch (err) {
    console.error(err);
    return jsonError("Could not create the new version. Please try again.", 500);
  }
}
