import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { managerDecisionSchema, uuidSchema, zodMessage } from "@/lib/validation";
import { audit, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const NEXT_STATUS = { approve: "approved", request_changes: "changes_requested", escalate: "escalated" } as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = managerDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const { action, comment } = parsed.data;

  try {
    const data = await loadLatest(id);
    if (!data) return jsonError("Submission not found", 404);
    const { submission, version } = data;
    if (submission.status !== "in_review" && submission.status !== "escalated") {
      return jsonError("Only submissions that are in review or escalated can be decided.", 409);
    }
    if (submission.status === "escalated" && action === "escalate") return jsonError("This submission is already escalated.", 409);

    const db = getDb();
    await db.insert(schema.decisions).values({ submissionId: id, role: "manager", action, comment: comment || null });
    await db.update(schema.submissions).set({ status: NEXT_STATUS[action], updatedAt: new Date() }).where(eq(schema.submissions.id, id));
    await audit("manager", `submission.${action}`, "submission", id, { version: version.versionNumber, from: submission.status, to: NEXT_STATUS[action], comment });
    return NextResponse.json({ status: NEXT_STATUS[action] });
  } catch (err) {
    console.error(err);
    return jsonError("Could not record the decision. Please try again.", 500);
  }
}
