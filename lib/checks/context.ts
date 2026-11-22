import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { CheckContext } from "./types";

/** Loads the live policy (active rules, terms, current facts, palette) for an org. */
export async function loadPolicy(orgId: string) {
  const db = getDb();
  const [[org], rules, terms, facts, assets, [pv]] = await Promise.all([
    db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1),
    db.select().from(schema.rules).where(and(eq(schema.rules.orgId, orgId), eq(schema.rules.active, true), eq(schema.rules.current, true))),
    db.select().from(schema.terms).where(eq(schema.terms.orgId, orgId)),
    db.select().from(schema.facts).where(and(eq(schema.facts.orgId, orgId), eq(schema.facts.current, true))),
    db.select().from(schema.brandAssets).where(eq(schema.brandAssets.orgId, orgId)).limit(1),
    db
      .select()
      .from(schema.policyVersions)
      .where(eq(schema.policyVersions.orgId, orgId))
      .orderBy(desc(schema.policyVersions.versionNumber))
      .limit(1),
  ]);
  if (!pv) throw new Error("No policy version found. Reset the demo to re-seed.");
  const ctx: CheckContext = {
    rules,
    terms,
    facts,
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  };
  return { ctx, policyVersion: pv, palette: assets[0]?.palette ?? [], orgName: org?.name ?? "the brand" };
}
