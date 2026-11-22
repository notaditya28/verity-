import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { uuidSchema } from "@/lib/validation";
import { audit, jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: mark a submission confidential. One-way: confidential can never be switched off. Audited. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  try {
    const db = getDb();
    const [sub] = await db
      .select()
      .from(schema.submissions)
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.orgId, DEMO_ORG_ID)))
      .limit(1);
    if (!sub) return jsonError("Submission not found", 404);
    if (sub.confidential) return NextResponse.json({ confidential: true });
    await db.update(schema.submissions).set({ confidential: true, updatedAt: new Date() }).where(eq(schema.submissions.id, id));
    await audit("manager", "submission.marked_confidential", "submission", id, { note: "Future checks run locally; earlier AI calls remain in the AI-use log." });
    return NextResponse.json({ confidential: true });
  } catch (err) {
    console.error(err);
    return jsonError("Could not update the submission. Please try again.", 500);
  }
}
