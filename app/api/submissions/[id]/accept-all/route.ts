import { isAutoApplicable } from "@/lib/checks/apply";
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";
import { audit, EDITABLE_STATUSES, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Accepts every pending finding that has an applicable (span) fix. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("creator");
  if (denied) return denied;
  try {
    const data = await loadLatest(id);
    if (!data) return jsonError("Submission not found", 404);
    if (!(EDITABLE_STATUSES as readonly string[]).includes(data.submission.status)) {
      return jsonError("This submission is with the reviewer, so decisions are locked.", 409);
    }
    const ids = data.findings
      .filter((f) => f.creatorDecision === "pending" && isAutoApplicable(f))
      .map((f) => f.id);
    if (ids.length) {
      await getDb()
        .update(schema.findings)
        .set({ creatorDecision: "accepted" })
        .where(and(inArray(schema.findings.id, ids), eq(schema.findings.creatorDecision, "pending")));
      await audit("creator", "finding.accepted_all", "submission", id, { count: ids.length, version: data.version.versionNumber });
    }
    return NextResponse.json({ accepted: ids.length });
  } catch (err) {
    console.error(err);
    return jsonError("Could not accept the fixes. Please try again.", 500);
  }
}
