import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "./db";
import type { Finding } from "./db/schema";
import { DEMO_ORG_ID } from "./demo/constants";
import { getRole, type UiRole } from "./role";

export const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns a 403 response when the current role isn't allowed, else null. */
export async function requireRole(role: UiRole): Promise<NextResponse | null> {
  const current = await getRole();
  if (current !== role) {
    return jsonError(
      role === "manager" ? "Only a Manager can do this. Switch role in the header." : "Only the Creator can do this. Switch role in the header.",
      403,
    );
  }
  return null;
}

/** Latest version, its latest check and that check's findings for a demo-org submission. */
export async function loadLatest(submissionId: string) {
  const db = getDb();
  const [submission] = await db
    .select()
    .from(schema.submissions)
    .where(and(eq(schema.submissions.id, submissionId), eq(schema.submissions.orgId, DEMO_ORG_ID)))
    .limit(1);
  if (!submission) return null;
  const [version] = await db
    .select()
    .from(schema.submissionVersions)
    .where(eq(schema.submissionVersions.submissionId, submissionId))
    .orderBy(desc(schema.submissionVersions.versionNumber))
    .limit(1);
  if (!version) return null;
  const [check] = await db
    .select()
    .from(schema.checks)
    .where(eq(schema.checks.submissionVersionId, version.id))
    .orderBy(desc(schema.checks.startedAt))
    .limit(1);
  const findings = check ? await db.select().from(schema.findings).where(eq(schema.findings.checkId, check.id)) : [];
  return { submission, version, check: check ?? null, findings };
}

/** Findings whose accepted/edited fix can be applied to the text (has a span and a fix). */
export function applicableFixes(findings: Finding[]) {
  return findings
    .filter((f) => (f.creatorDecision === "accepted" || f.creatorDecision === "edited") && f.spanStart !== null && f.spanEnd !== null)
    .map((f) => ({ id: f.id, spanStart: f.spanStart, spanEnd: f.spanEnd, fix: f.creatorDecision === "edited" ? f.editedFix : f.suggestedFix }))
    .filter((f) => f.fix !== null);
}

/** Alt text from an accepted/edited A-01 finding (image alt-text fixes update the next version's alt text). */
export function acceptedAltText(findings: Finding[]): string | null {
  const f = findings.find((x) => x.ruleCode === "A-01" && (x.creatorDecision === "accepted" || x.creatorDecision === "edited"));
  const alt = f ? (f.creatorDecision === "edited" ? f.editedFix : f.suggestedFix) : null;
  return alt?.trim() ? alt.trim().slice(0, 500) : null;
}

export function isBlocking(f: Pick<Finding, "severity" | "creatorDecision">) {
  return (f.severity === "high" || f.severity === "critical") && f.creatorDecision === "pending";
}

export async function audit(actorRole: "creator" | "manager" | "system", action: string, entity: string, entityId: string, details: Record<string, unknown>) {
  await getDb().insert(schema.auditLog).values({ orgId: DEMO_ORG_ID, actorRole, action, entity, entityId, details });
}
