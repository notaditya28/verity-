import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { DEMO_ORG_ID } from "./demo/constants";

export async function getBrandData() {
  const db = getDb();
  const [rules, facts, assets, versions] = await Promise.all([
    db.select().from(schema.rules).where(eq(schema.rules.orgId, DEMO_ORG_ID)).orderBy(asc(schema.rules.code), desc(schema.rules.current)),
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
  // Rules are versioned: list the current row of each code, keep older rows as that rule's history.
  const ruleHistory = new Map<string, typeof rules>();
  for (const r of rules) ruleHistory.set(r.code, [...(ruleHistory.get(r.code) ?? []), r]);
  return { rules: rules.filter((r) => r.current), ruleHistory, facts, asset: assets[0] ?? null, versions, versionById };
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
    db.select().from(schema.rules).where(eq(schema.rules.orgId, DEMO_ORG_ID)).orderBy(asc(schema.rules.current)),
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

/** Review queue: submissions awaiting a manager, plus recently decided ones, with open-finding counts from their latest check. */
export async function getReviewQueue() {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.orgId, DEMO_ORG_ID), inArray(schema.submissions.status, ["in_review", "escalated", "approved", "changes_requested"])))
    .orderBy(desc(schema.submissions.updatedAt))
    .limit(100);
  if (rows.length === 0) return [];
  const counts = await db.execute<{ submission_id: string; total: number; disputed: number; open_high: number }>(sql`
    select distinct on (sv.submission_id)
      sv.submission_id,
      (select count(*) from findings f where f.check_id = c.id)::int as total,
      (select count(*) from findings f where f.check_id = c.id and f.creator_decision = 'disputed')::int as disputed,
      (select count(*) from findings f where f.check_id = c.id and f.creator_decision = 'pending' and f.severity in ('high','critical'))::int as open_high
    from submission_versions sv
    join checks c on c.submission_version_id = sv.id
    where sv.submission_id in ${sql`(${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`}
    order by sv.submission_id, sv.version_number desc, c.started_at desc`);
  const bySub = new Map([...counts].map((c) => [c.submission_id, c]));
  return rows.map((r) => ({ ...r, stats: bySub.get(r.id) ?? null }));
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
