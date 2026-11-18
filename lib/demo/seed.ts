import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { DEMO_ORG_ID, DEMO_ORG_NAME } from "./constants";
import { SEED_FACTS, SEED_FONTS, SEED_PALETTE, SEED_RULES, SEED_TERMS } from "./seed-data";

type DB = PostgresJsDatabase<typeof schema>;

/** Wipes the demo org (cascades to everything it owns) and re-creates it from seed data. */
export async function seedDemo(db: DB) {
  await db.execute(sql`create extension if not exists pg_trgm`);

  await db.transaction(async (tx) => {
    // Submissions first (cascades to versions → checks → findings): checks reference policy_versions, so deleting
    // the org first would remove policy versions that checks still point to.
    await tx.delete(schema.submissions).where(sql`${schema.submissions.orgId} = ${DEMO_ORG_ID}`);
    await tx.delete(schema.organizations).where(sql`${schema.organizations.id} = ${DEMO_ORG_ID}`);
    await tx.insert(schema.organizations).values({ id: DEMO_ORG_ID, name: DEMO_ORG_NAME });

    const [pv] = await tx
      .insert(schema.policyVersions)
      .values({ orgId: DEMO_ORG_ID, versionNumber: 1, note: "Initial brand guidelines (seed)" })
      .returning();

    await tx.insert(schema.rules).values(
      SEED_RULES.map((r) => ({
        orgId: DEMO_ORG_ID,
        code: r.code,
        category: r.category,
        title: r.title,
        description: r.description,
        severity: r.severity,
        checkType: r.checkType,
        params: r.params ?? {},
        policyVersionId: pv.id,
      })),
    );

    await tx.insert(schema.terms).values(SEED_TERMS.map((t) => ({ orgId: DEMO_ORG_ID, ...t })));

    await tx
      .insert(schema.facts)
      .values(SEED_FACTS.map((f) => ({ orgId: DEMO_ORG_ID, ...f, policyVersionId: pv.id })));

    await tx.insert(schema.brandAssets).values({
      orgId: DEMO_ORG_ID,
      palette: SEED_PALETTE,
      fonts: SEED_FONTS,
      logoUrl: null,
    });

    await tx.insert(schema.auditLog).values({
      orgId: DEMO_ORG_ID,
      actorRole: "system",
      action: "demo.seeded",
      entity: "organization",
      entityId: DEMO_ORG_ID,
      details: { rules: SEED_RULES.length, facts: SEED_FACTS.length, policyVersion: 1 },
    });
  });
}
