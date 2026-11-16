import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";
import { acceptedAltText, applicableFixes, audit, EDITABLE_STATUSES, isBlocking, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("creator");
  if (denied) return denied;

  try {
    const data = await loadLatest(id);
    if (!data) return jsonError("Submission not found", 404);
    const { submission, version, check, findings } = data;
    if (!(EDITABLE_STATUSES as readonly string[]).includes(submission.status)) {
      return jsonError("This submission is already with the reviewer.", 409);
    }
    if (!check || check.status === "running" || check.status === "failed") {
      return jsonError("Run a successful check on this version before submitting.", 409);
    }
    const alt = acceptedAltText(findings);
    if (applicableFixes(findings).length > 0 || (alt !== null && alt !== version.altText)) {
      return jsonError("You have accepted fixes that aren't applied yet. Click “Apply accepted fixes” first.", 409);
    }
    const blockers = findings.filter(isBlocking);
    if (blockers.length > 0) {
      return jsonError(
        `${blockers.length} high or critical finding${blockers.length > 1 ? "s" : ""} still need${blockers.length > 1 ? "" : "s"} a decision. Accept and apply the fix, or dispute it with a reason.`,
        409,
      );
    }

    await getDb().update(schema.submissions).set({ status: "in_review", updatedAt: new Date() }).where(eq(schema.submissions.id, id));
    const counts = {
      total: findings.length,
      disputed: findings.filter((f) => f.creatorDecision === "disputed").length,
      pending: findings.filter((f) => f.creatorDecision === "pending").length,
    };
    await audit("creator", "submission.submitted", "submission", id, { version: version.versionNumber, checkId: check.id, findings: counts });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonError("Could not submit for review. Please try again.", 500);
  }
}
