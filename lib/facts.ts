import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Fact } from "./db/schema";
import { DEMO_ORG_ID } from "./demo/constants";
import { detectDrift, detectExpired, todayIst, type DriftResult } from "./drift/detect";

export type UpdateFactResult =
  | { status: "not_found" }
  | { status: "unchanged" }
  | { status: "updated"; policyVersion: number; old: Fact; created: Fact; drift: DriftResult | null };

/**
 * Edits a fact without overwriting it: a new policy version and a new fact row; the old row is kept (current = false).
 * Then Fact Drift runs in the same request: a value change opens "changed" alerts; a validity-only edit is left to
 * expiry detection. Used by the API route and by the eval script, so both exercise the same path.
 */
export async function updateFact(code: string, input: { value: string; validUntil?: string | null; note?: string }): Promise<UpdateFactResult> {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(schema.facts)
      .where(and(eq(schema.facts.orgId, DEMO_ORG_ID), eq(schema.facts.code, code), eq(schema.facts.current, true)))
      .limit(1);
    if (!old) return { status: "not_found" as const };
    const validUntil = input.validUntil === undefined ? old.validUntil : input.validUntil;
    if (old.value === input.value && old.validUntil === validUntil) return { status: "unchanged" as const };

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
    const [created] = await tx
      .insert(schema.facts)
      .values({
        orgId: DEMO_ORG_ID,
        code,
        subject: old.subject,
        attribute: old.attribute,
        value: input.value,
        unit: old.unit,
        owner: old.owner,
        sourceDoc: old.sourceDoc,
        validFrom: todayIst(),
        validUntil,
        current: true,
        policyVersionId: pv.id,
      })
      .returning();
    await tx.insert(schema.auditLog).values({
      orgId: DEMO_ORG_ID,
      actorRole: "manager",
      action: "fact.updated",
      entity: "fact",
      entityId: code,
      details: { from: old.value, to: input.value, validUntil, policyVersion: versionNumber },
    });
    return { status: "updated" as const, policyVersion: versionNumber, old, created };
  });
  if (result.status !== "updated") return result;

  let drift: DriftResult | null = null;
  try {
    if (result.old.value !== result.created.value) drift = await detectDrift(result.old, result.created, "changed");
    else await detectExpired();
  } catch (err) {
    console.error("drift detection failed", err);
  }
  return { ...result, drift };
}
