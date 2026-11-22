import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Fact } from "../db/schema";
import { DEMO_ORG_ID } from "../demo/constants";
import { findValueMentions, statesValue } from "./match";

/** Statuses where content is out (approved) or about to go out (in review / escalated). */
export const DRIFT_STATUSES = ["approved", "in_review", "escalated"] as const;

export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

interface Candidate {
  submissionId: string;
  versionId: string;
  text: string;
  extractedText: string | null;
}

/** Current (latest) version of every approved / in-review / escalated submission in the org. */
async function candidates(orgId: string): Promise<Candidate[]> {
  const db = getDb();
  const rows = await db.execute<{ submission_id: string; version_id: string; text: string; extracted_text: string | null }>(sql`
    select distinct on (v.submission_id) v.submission_id, v.id as version_id, v.text, v.extracted_text
    from ${schema.submissionVersions} v
    join ${schema.submissions} s on s.id = v.submission_id
    where s.org_id = ${orgId} and s.status in ('approved','in_review','escalated')
    order by v.submission_id, v.version_number desc`);
  return rows.map((r) => ({ submissionId: r.submission_id, versionId: r.version_id, text: r.text, extractedText: r.extracted_text }));
}

export interface DriftResult {
  candidates: number;
  created: number;
  byUsage: number;
  byScan: number;
  ms: number;
}

/**
 * Finds content still relying on `oldFact` and opens alerts (idempotent: unique on old fact + submission).
 * 1. Recorded usages of that exact fact row on the submission's current version, whose text states the old value.
 * 2. Fallback scan of the current text and image text, for versions with no recorded usage of this fact code
 *    (content checked before usages were recorded).
 */
export async function detectDrift(oldFact: Fact, newFact: Fact | null, reason: "changed" | "expired"): Promise<DriftResult> {
  const t0 = Date.now();
  const db = getDb();
  const cands = await candidates(oldFact.orgId);
  if (!cands.length) return { candidates: 0, created: 0, byUsage: 0, byScan: 0, ms: Date.now() - t0 };
  const versionIds = cands.map((c) => c.versionId);

  // Content checked against any row of this fact that had the same value (e.g. before a validity-only edit) counts.
  const sameValueRows = await db
    .select({ id: schema.facts.id })
    .from(schema.facts)
    .where(and(eq(schema.facts.orgId, oldFact.orgId), eq(schema.facts.code, oldFact.code), eq(schema.facts.value, oldFact.value)));
  const oldIds = new Set([oldFact.id, ...sameValueRows.map((r) => r.id)]);
  if (newFact) oldIds.delete(newFact.id);

  const usages = await db
    .select({ versionId: schema.factUsages.submissionVersionId, factId: schema.factUsages.factId, matchedText: schema.factUsages.matchedText })
    .from(schema.factUsages)
    .where(and(eq(schema.factUsages.factCode, oldFact.code), inArray(schema.factUsages.submissionVersionId, versionIds)));

  const alerts: (typeof schema.driftAlerts.$inferInsert)[] = [];
  for (const c of cands) {
    const mine = usages.filter((u) => u.versionId === c.versionId);
    const hit = mine.find((u) => !!u.factId && oldIds.has(u.factId) && statesValue(u.matchedText, oldFact));
    if (hit) {
      alerts.push({ ...alertBase(oldFact, newFact, reason, c), matchedText: hit.matchedText, detection: "usage" });
      continue;
    }
    if (mine.length) continue; // this version was checked against this fact and didn't use the old value
    const mention = findValueMentions(c.text, oldFact)[0] ?? (c.extractedText ? findValueMentions(c.extractedText, oldFact)[0] : undefined);
    if (mention) alerts.push({ ...alertBase(oldFact, newFact, reason, c), matchedText: mention.matchedText, detection: "scan" });
  }

  let created = 0;
  if (alerts.length) {
    const inserted = await db.insert(schema.driftAlerts).values(alerts).onConflictDoNothing().returning({ id: schema.driftAlerts.id });
    created = inserted.length;
  }
  const result = {
    candidates: cands.length,
    created,
    byUsage: alerts.filter((a) => a.detection === "usage").length,
    byScan: alerts.filter((a) => a.detection === "scan").length,
    ms: Date.now() - t0,
  };
  await db.insert(schema.auditLog).values({
    orgId: oldFact.orgId,
    actorRole: "system",
    action: "drift.detected",
    entity: "fact",
    entityId: oldFact.code,
    details: { reason, from: oldFact.value, to: newFact?.value ?? null, ...result },
  });
  return result;
}

function alertBase(oldFact: Fact, newFact: Fact | null, reason: "changed" | "expired", c: Candidate) {
  return {
    orgId: oldFact.orgId,
    factCode: oldFact.code,
    oldFactId: oldFact.id,
    newFactId: newFact?.id ?? null,
    reason,
    submissionId: c.submissionId,
    submissionVersionId: c.versionId,
  };
}

/**
 * Opens "expired" alerts for current facts whose valid_until has passed. Cheap when nothing has expired (one query);
 * idempotent thanks to the unique key, so it can run on every page load of /drift and the header badge.
 */
export async function detectExpired(orgId = DEMO_ORG_ID): Promise<number> {
  const db = getDb();
  const expired = await db
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.orgId, orgId), eq(schema.facts.current, true), isNotNull(schema.facts.validUntil), lt(schema.facts.validUntil, todayIst())));
  let created = 0;
  for (const f of expired) {
    // Skip the work (and the audit entry) when this expiry was already processed.
    const [done] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.orgId, orgId), eq(schema.auditLog.action, "drift.detected"), eq(schema.auditLog.entityId, f.code), sql`${schema.auditLog.details}->>'reason' = 'expired'`, sql`${schema.auditLog.details}->>'from' = ${f.value}`));
    if (done && done.n > 0) continue;
    created += (await detectDrift(f, null, "expired")).created;
  }
  return created;
}

/** Open alert count for the header badge (runs expiry detection first). Never throws. */
export async function openDriftCount(orgId = DEMO_ORG_ID): Promise<number> {
  try {
    await detectExpired(orgId);
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.driftAlerts)
      .where(and(eq(schema.driftAlerts.orgId, orgId), eq(schema.driftAlerts.status, "open")));
    return row?.n ?? 0;
  } catch (err) {
    console.error("drift count failed", err);
    return 0;
  }
}

/**
 * After a submission is (re-)approved: an open or sent-back alert is resolved when the latest check on the current
 * version no longer uses the old value (no usage of the old fact row stating it, and no scan match in the text).
 */
export async function resolveDriftForSubmission(submissionId: string): Promise<number> {
  const db = getDb();
  const alerts = await db
    .select()
    .from(schema.driftAlerts)
    .where(and(eq(schema.driftAlerts.submissionId, submissionId), inArray(schema.driftAlerts.status, ["open", "sent_back"])));
  if (!alerts.length) return 0;
  const [version] = await db
    .select()
    .from(schema.submissionVersions)
    .where(eq(schema.submissionVersions.submissionId, submissionId))
    .orderBy(desc(schema.submissionVersions.versionNumber))
    .limit(1);
  if (!version) return 0;
  const [check] = await db
    .select()
    .from(schema.checks)
    .where(eq(schema.checks.submissionVersionId, version.id))
    .orderBy(desc(schema.checks.startedAt))
    .limit(1);
  const usages = check ? await db.select().from(schema.factUsages).where(eq(schema.factUsages.checkId, check.id)) : [];
  let resolved = 0;
  for (const a of alerts) {
    const [oldFact] = await db.select().from(schema.facts).where(eq(schema.facts.id, a.oldFactId)).limit(1);
    if (!oldFact) continue;
    const sameValue = await db
      .select({ id: schema.facts.id })
      .from(schema.facts)
      .where(and(eq(schema.facts.orgId, oldFact.orgId), eq(schema.facts.code, oldFact.code), eq(schema.facts.value, oldFact.value)));
    const oldIds = new Set([oldFact.id, ...sameValue.map((r) => r.id)]);
    const stillUsed =
      usages.some((u) => !!u.factId && oldIds.has(u.factId) && statesValue(u.matchedText, oldFact)) ||
      // For "changed" alerts, the old value written anywhere in the content still counts.
      (a.reason === "changed" && (findValueMentions(version.text, oldFact).length > 0 || findValueMentions(version.extractedText ?? "", oldFact).length > 0));
    if (stillUsed) continue;
    await db
      .update(schema.driftAlerts)
      .set({ status: "resolved", resolvedAt: new Date(), resolutionNote: `Resolved automatically: v${version.versionNumber} no longer uses ${a.matchedText}.` })
      .where(eq(schema.driftAlerts.id, a.id));
    await db.insert(schema.auditLog).values({
      orgId: a.orgId,
      actorRole: "system",
      action: "drift.resolved",
      entity: "submission",
      entityId: submissionId,
      details: { alertId: a.id, factCode: a.factCode, version: version.versionNumber },
    });
    resolved++;
  }
  return resolved;
}
