import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { uuidSchema } from "@/lib/validation";
import { audit, jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: remove a sensitive term (kept as inactive for the record). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid id", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  try {
    const res = await getDb()
      .update(schema.sensitiveTerms)
      .set({ active: false })
      .where(and(eq(schema.sensitiveTerms.id, id), eq(schema.sensitiveTerms.orgId, DEMO_ORG_ID)))
      .returning({ id: schema.sensitiveTerms.id });
    if (!res.length) return jsonError("Term not found", 404);
    await audit("manager", "sensitive_term.removed", "sensitive_term", id, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonError("Could not remove the term. Please try again.", 500);
  }
}
