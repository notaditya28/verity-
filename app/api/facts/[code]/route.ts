import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { factEditSchema, zodMessage } from "@/lib/validation";
import { detectDrift, detectExpired } from "@/lib/drift/detect";
import { jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Editing a fact never overwrites it: it creates a new policy version and a new fact row; the old row is kept. */
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z]+-\d+$/.test(code)) return jsonError("Invalid fact code", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = factEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const input = parsed.data;

  try {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(schema.facts)
        .where(and(eq(schema.facts.orgId, DEMO_ORG_ID), eq(schema.facts.code, code), eq(schema.facts.current, true)))
        .limit(1);
      if (!old) return null;
      const validUntil = input.validUntil === undefined ? old.validUntil : input.validUntil;
      if (old.value === input.value && old.validUntil === validUntil) return { unchanged: true as const };

      const [latest] = await tx
        .select()
        .from(schema.policyVersions)
        .where(eq(schema.policyVersions.orgId, DEMO_ORG_ID))
        .orderBy(desc(schema.policyVersions.versionNumber))
        .limit(1);
      const versionNumber = (latest?.versionNumber ?? 0) + 1;
      const [pv] = await tx
        .insert(schema.policyVersions)
        .values({ orgId: DEMO_ORG_ID, versionNumber, note: input.note || `Updated ${code}: ${old.value} → ${input.value}` })
        .returning();
      await tx.update(schema.facts).set({ current: false }).where(eq(schema.facts.id, old.id));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const [created] = await tx.insert(schema.facts).values({
        orgId: DEMO_ORG_ID,
        code,
        subject: old.subject,
        attribute: old.attribute,
        value: input.value,
        unit: old.unit,
        owner: old.owner,
        sourceDoc: old.sourceDoc,
        validFrom: today,
        validUntil,
        current: true,
        policyVersionId: pv.id,
      }).returning();
      await tx.insert(schema.auditLog).values({
        orgId: DEMO_ORG_ID,
        actorRole: "manager",
        action: "fact.updated",
        entity: "fact",
        entityId: code,
        details: { from: old.value, to: input.value, validUntil, policyVersion: versionNumber },
      });
      return { unchanged: false as const, policyVersion: versionNumber, old, created };
    });
    if (!result) return jsonError("Fact not found", 404);
    if (result.unchanged) return NextResponse.json({ unchanged: true });
    // Fact Drift: find approved / in-review content that still uses the old value (same request, < 10 s on demo data).
    // A validity-only edit doesn't change the value; expiry detection handles a past valid-until date.
    let drift = null;
    try {
      if (result.old.value !== result.created.value) drift = await detectDrift(result.old, result.created, "changed");
      else await detectExpired();
    } catch (err) {
      console.error("drift detection failed", err);
    }
    return NextResponse.json({ unchanged: false, policyVersion: result.policyVersion, drift });
  } catch (err) {
    console.error(err);
    return jsonError("Could not update the fact. Please try again.", 500);
  }
}
