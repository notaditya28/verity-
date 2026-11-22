import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Fact } from "../db/schema";
import { DEMO_ORG_ID } from "../demo/constants";

export const ALERT_STATUSES = ["open", "sent_back", "dismissed", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertView {
  id: string;
  factCode: string;
  reason: "changed" | "expired";
  status: AlertStatus;
  detection: "usage" | "scan";
  matchedText: string;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  submission: { id: string; title: string; status: string; demoHistory: boolean; confidential: boolean };
  versionNumber: number;
  versionText: string;
  extractedText: string | null;
  oldFact: Fact;
  newFact: Fact | null;
}

/** Alerts with their submission, version text and old/new fact rows. */
export async function listAlerts(status?: AlertStatus, submissionId?: string): Promise<AlertView[]> {
  const db = getDb();
  const where = [eq(schema.driftAlerts.orgId, DEMO_ORG_ID)];
  if (status) where.push(eq(schema.driftAlerts.status, status));
  if (submissionId) where.push(eq(schema.driftAlerts.submissionId, submissionId));
  const rows = await db
    .select({ alert: schema.driftAlerts, submission: schema.submissions, version: schema.submissionVersions })
    .from(schema.driftAlerts)
    .innerJoin(schema.submissions, eq(schema.submissions.id, schema.driftAlerts.submissionId))
    .innerJoin(schema.submissionVersions, eq(schema.submissionVersions.id, schema.driftAlerts.submissionVersionId))
    .where(and(...where))
    .orderBy(schema.driftAlerts.factCode, sql`${schema.driftAlerts.createdAt} desc`);
  const factIds = [...new Set(rows.flatMap((r) => [r.alert.oldFactId, r.alert.newFactId].filter((x): x is string => !!x)))];
  const facts = factIds.length ? await db.select().from(schema.facts).where(inArray(schema.facts.id, factIds)) : [];
  const byId = new Map(facts.map((f) => [f.id, f]));
  return rows
    .filter((r) => byId.has(r.alert.oldFactId))
    .map((r) => ({
      id: r.alert.id,
      factCode: r.alert.factCode,
      reason: r.alert.reason,
      status: r.alert.status,
      detection: r.alert.detection,
      matchedText: r.alert.matchedText,
      resolutionNote: r.alert.resolutionNote,
      createdAt: r.alert.createdAt,
      resolvedAt: r.alert.resolvedAt,
      submission: { id: r.submission.id, title: r.submission.title, status: r.submission.status, demoHistory: r.submission.demoHistory, confidential: r.submission.confidential },
      versionNumber: r.version.versionNumber,
      versionText: r.version.text,
      extractedText: r.version.extractedText,
      oldFact: byId.get(r.alert.oldFactId)!,
      newFact: r.alert.newFactId ? (byId.get(r.alert.newFactId) ?? null) : null,
    }));
}

export async function alertCounts(): Promise<Record<AlertStatus, number>> {
  const rows = await getDb()
    .select({ status: schema.driftAlerts.status, n: sql<number>`count(*)::int` })
    .from(schema.driftAlerts)
    .where(eq(schema.driftAlerts.orgId, DEMO_ORG_ID))
    .groupBy(schema.driftAlerts.status);
  const out = { open: 0, sent_back: 0, dismissed: 0, resolved: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Every row (current and old) for each fact code, newest first — the per-fact history on /brand. */
export async function factHistory(): Promise<Map<string, Fact[]>> {
  const rows = await getDb()
    .select()
    .from(schema.facts)
    .where(eq(schema.facts.orgId, DEMO_ORG_ID))
    .orderBy(schema.facts.code, sql`${schema.facts.validFrom} desc`, sql`${schema.facts.current} desc`);
  const map = new Map<string, Fact[]>();
  for (const f of rows) map.set(f.code, [...(map.get(f.code) ?? []), f]);
  return map;
}
