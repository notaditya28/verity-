import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { sensitiveTermSchema, zodMessage } from "@/lib/validation";
import { audit, jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: add a sensitive term (masked as [SENSITIVE] before any AI call). The audit stores no term text. */
export async function POST(req: Request) {
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = sensitiveTermSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  try {
    const db = getDb();
    const [dupe] = await db
      .select({ id: schema.sensitiveTerms.id })
      .from(schema.sensitiveTerms)
      .where(
        and(
          eq(schema.sensitiveTerms.orgId, DEMO_ORG_ID),
          eq(schema.sensitiveTerms.active, true),
          sql`lower(${schema.sensitiveTerms.term}) = lower(${parsed.data.term})`,
        ),
      )
      .limit(1);
    if (dupe) return jsonError("That term is already on the list.", 409);
    const [row] = await db
      .insert(schema.sensitiveTerms)
      .values({ orgId: DEMO_ORG_ID, term: parsed.data.term, note: parsed.data.note || null })
      .returning();
    await audit("manager", "sensitive_term.added", "sensitive_term", row.id, { length: row.term.length });
    return NextResponse.json({ id: row.id });
  } catch (err) {
    console.error(err);
    return jsonError("Could not add the term. Please try again.", 500);
  }
}
