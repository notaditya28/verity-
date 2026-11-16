import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { DEMO_ORG_ID } from "./demo/constants";

export async function getBrandData() {
  const db = getDb();
  const [rules, facts, assets, versions] = await Promise.all([
    db.select().from(schema.rules).where(eq(schema.rules.orgId, DEMO_ORG_ID)).orderBy(asc(schema.rules.code)),
    db
      .select()
      .from(schema.facts)
      .where(and(eq(schema.facts.orgId, DEMO_ORG_ID), eq(schema.facts.current, true)))
      .orderBy(asc(schema.facts.code)),
    db.select().from(schema.brandAssets).where(eq(schema.brandAssets.orgId, DEMO_ORG_ID)).limit(1),
    db
      .select()
      .from(schema.policyVersions)
      .where(eq(schema.policyVersions.orgId, DEMO_ORG_ID))
      .orderBy(desc(schema.policyVersions.versionNumber)),
  ]);
  const versionById = new Map(versions.map((v) => [v.id, v.versionNumber]));
  return { rules, facts, asset: assets[0] ?? null, versions, versionById };
}

export async function getSubmissionDetail(id: string) {
  const db = getDb();
  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.id, id), eq(schema.submissions.orgId, DEMO_ORG_ID)))
    .limit(1);
  if (!submission) return null;
  const versions = await db
    .select()
    .from(schema.submissionVersions)
    .where(eq(schema.submissionVersions.submissionId, id))
    .orderBy(desc(schema.submissionVersions.versionNumber));
  const version = versions[0];
  const [check] = version
    ? await db
        .select()
        .from(schema.checks)
        .where(eq(schema.checks.submissionVersionId, version.id))
        .orderBy(desc(schema.checks.startedAt))
        .limit(1)
    : [];
  const findings = check
    ? await db.select().from(schema.findings).where(eq(schema.findings.checkId, check.id)).orderBy(asc(schema.findings.spanStart))
    : [];
  const [rules, facts, decisions] = await Promise.all([
    db.select().from(schema.rules).where(eq(schema.rules.orgId, DEMO_ORG_ID)),
    db.select().from(schema.facts).where(eq(schema.facts.orgId, DEMO_ORG_ID)),
    db.select().from(schema.decisions).where(eq(schema.decisions.submissionId, id)).orderBy(desc(schema.decisions.createdAt)),
  ]);
  return { submission, versions, version, check: check ?? null, findings, rules, facts, decisions };
}

export async function listSubmissions() {
  const db = getDb();
  return db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.orgId, DEMO_ORG_ID))
    .orderBy(desc(schema.submissions.updatedAt))
    .limit(100);
}

export async function getAuditLog(limit = 200) {
  const db = getDb();
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.orgId, DEMO_ORG_ID))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
}
