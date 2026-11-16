import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { findingDecisionSchema, uuidSchema, zodMessage } from "@/lib/validation";
import { audit, EDITABLE_STATUSES, jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid finding id", 400);
  const denied = await requireRole("creator");
  if (denied) return denied;
  const parsed = findingDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const { decision, editedFix, disputeReason } = parsed.data;

  try {
    const db = getDb();
    const [row] = await db
      .select({ finding: schema.findings, submission: schema.submissions })
      .from(schema.findings)
      .innerJoin(schema.checks, eq(schema.checks.id, schema.findings.checkId))
      .innerJoin(schema.submissionVersions, eq(schema.submissionVersions.id, schema.checks.submissionVersionId))
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.submissionVersions.submissionId))
      .where(eq(schema.findings.id, id))
      .limit(1);
    if (!row || row.submission.orgId !== DEMO_ORG_ID) return jsonError("Finding not found", 404);
    if (!(EDITABLE_STATUSES as readonly string[]).includes(row.submission.status)) {
      return jsonError("This submission is with the reviewer, so decisions are locked.", 409);
    }

    await db
      .update(schema.findings)
      .set({
        creatorDecision: decision,
        editedFix: decision === "edited" ? (editedFix ?? "") : null,
        disputeReason: decision === "disputed" ? (disputeReason ?? null) : null,
      })
      .where(eq(schema.findings.id, id));
    await audit("creator", `finding.${decision}`, "finding", id, {
      submissionId: row.submission.id,
      ruleCode: row.finding.ruleCode,
      factCode: row.finding.factCode,
      source: row.finding.source,
      ...(decision === "disputed" ? { reason: disputeReason } : {}),
      ...(decision === "edited" ? { editedFix } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonError("Could not save your decision. Please try again.", 500);
  }
}
