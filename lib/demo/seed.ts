import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { DEMO_ORG_ID, DEMO_ORG_NAME } from "./constants";
import { runDeterministicChecksWithUsages } from "../checks/deterministic";
import type { CheckContext } from "../checks/types";
import { SEED_APPROVED_POSTS, SEED_FACTS, SEED_FONTS, SEED_PALETTE, SEED_RULES, SEED_TERMS } from "./seed-data";

type DB = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const daysAgo = (n: number, hours = 0) => new Date(Date.now() - n * 86_400_000 + hours * 3_600_000);

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

    const rules = await tx.insert(schema.rules).values(
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
    ).returning();

    await tx.insert(schema.terms).values(SEED_TERMS.map((t) => ({ orgId: DEMO_ORG_ID, ...t })));

    const facts = await tx
      .insert(schema.facts)
      .values(SEED_FACTS.map((f) => ({ orgId: DEMO_ORG_ID, ...f, policyVersionId: pv.id })))
      .returning();

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

    const ctx: CheckContext = {
      rules,
      terms: SEED_TERMS,
      facts,
      today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    };
    await seedApprovedPosts(tx, pv.id, ctx);
  });
}

/**
 * Fictional approved posts with a full history (version, check, recorded fact usages, approval, audit). The check is
 * the real rule engine run on the post, so the recorded usages are exactly what a live check would record.
 */
async function seedApprovedPosts(tx: Tx, policyVersionId: string, ctx: CheckContext) {
  for (const p of SEED_APPROVED_POSTS) {
    const created = daysAgo(p.daysAgo);
    const [sub] = await tx
      .insert(schema.submissions)
      .values({
        orgId: DEMO_ORG_ID,
        title: p.title,
        channel: p.channel,
        goal: p.goal,
        audience: p.audience,
        cta: p.cta,
        status: "approved",
        demoHistory: true,
        createdAt: created,
        updatedAt: daysAgo(p.daysAgo, 3),
      })
      .returning();
    const [ver] = await tx
      .insert(schema.submissionVersions)
      .values({ submissionId: sub.id, versionNumber: 1, text: p.text, createdAt: created })
      .returning();
    const { findings, usages } = runDeterministicChecksWithUsages({ text: p.text, channel: p.channel }, ctx);
    const [check] = await tx
      .insert(schema.checks)
      .values({
        submissionVersionId: ver.id,
        policyVersionId,
        status: "completed",
        aiStatus: "skipped",
        error: "Seeded demo history (fictional): only rule checks were run.",
        startedAt: daysAgo(p.daysAgo, 0.01),
        finishedAt: daysAgo(p.daysAgo, 0.02),
      })
      .returning();
    if (findings.length) await tx.insert(schema.findings).values(findings.map((f) => ({ ...f, checkId: check.id })));
    if (usages.length) {
      await tx.insert(schema.factUsages).values(
        usages.map((u) => ({
          orgId: DEMO_ORG_ID,
          checkId: check.id,
          submissionId: sub.id,
          submissionVersionId: ver.id,
          factCode: u.factCode,
          factId: u.factId,
          matchedText: u.matchedText,
          spanStart: u.spanStart,
          spanEnd: u.spanEnd,
          source: "rule" as const,
          createdAt: created,
        })),
      );
    }
    await tx.insert(schema.decisions).values({ submissionId: sub.id, role: "manager", action: "approve", comment: "Approved (demo history).", createdAt: daysAgo(p.daysAgo, 3) });
    const entries = [
      ["creator", "submission.created", 0],
      ["system", "check.completed", 0.02],
      ["creator", "submission.submitted", 1],
      ["manager", "submission.approve", 3],
    ] as const;
    await tx.insert(schema.auditLog).values(
      entries.map(([actorRole, action, h]) => ({
        orgId: DEMO_ORG_ID,
        actorRole,
        action,
        entity: "submission",
        entityId: sub.id,
        details: { title: p.title, demoHistory: true, ...(action === "check.completed" ? { ruleFindings: findings.length, factUsages: usages.length } : {}) },
        createdAt: daysAgo(p.daysAgo, h),
      })),
    );
  }
}
