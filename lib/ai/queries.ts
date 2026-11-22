import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { AiCall } from "../db/schema";
import { DEMO_ORG_ID } from "../demo/constants";

export const AI_PURPOSES = ["judge", "vision", "clarification"] as const;
export const AI_STATUSES = ["ok", "error", "timeout", "skipped_confidential"] as const;

export interface AiLogFilters {
  purpose?: (typeof AI_PURPOSES)[number];
  status?: (typeof AI_STATUSES)[number];
  submissionId?: string;
}

function where(f: AiLogFilters): SQL[] {
  const w: SQL[] = [eq(schema.aiCalls.orgId, DEMO_ORG_ID)];
  if (f.purpose) w.push(eq(schema.aiCalls.purpose, f.purpose));
  if (f.status) w.push(eq(schema.aiCalls.status, f.status));
  if (f.submissionId) w.push(eq(schema.aiCalls.submissionId, f.submissionId));
  return w;
}

export async function listAiCalls(f: AiLogFilters = {}, limit = 200) {
  return getDb()
    .select({ call: schema.aiCalls, title: schema.submissions.title, confidential: schema.submissions.confidential })
    .from(schema.aiCalls)
    .leftJoin(schema.submissions, eq(schema.submissions.id, schema.aiCalls.submissionId))
    .where(and(...where(f)))
    .orderBy(desc(schema.aiCalls.createdAt))
    .limit(limit);
}

/** Organisation-wide totals, computed from the rows (never stored numbers). */
export async function aiTotals(f: AiLogFilters = {}) {
  const [row] = await getDb()
    .select({
      calls: sql<number>`count(*) filter (where ${schema.aiCalls.status} <> 'skipped_confidential')::int`,
      ok: sql<number>`count(*) filter (where ${schema.aiCalls.status} = 'ok')::int`,
      failed: sql<number>`count(*) filter (where ${schema.aiCalls.status} in ('error','timeout'))::int`,
      chars: sql<number>`coalesce(sum(${schema.aiCalls.charsSent}), 0)::int`,
      images: sql<number>`count(*) filter (where ${schema.aiCalls.imageSent})::int`,
      withheld: sql<number>`coalesce(sum(${schema.aiCalls.withheldSections}), 0)::int`,
      sensitive: sql<number>`coalesce(sum(${schema.aiCalls.sensitiveTermsMasked}), 0)::int`,
      keptLocal: sql<number>`count(*) filter (where ${schema.aiCalls.status} = 'skipped_confidential')::int`,
    })
    .from(schema.aiCalls)
    .where(and(...where(f)));
  // Personal-data items masked: summed from each row's redaction counts.
  const counts = await getDb().select({ r: schema.aiCalls.redactionCounts }).from(schema.aiCalls).where(and(...where(f)));
  const personal = counts.reduce((n, c) => n + c.r.reduce((m, x) => m + x.count, 0), 0);
  return { ...(row ?? { calls: 0, ok: 0, failed: 0, chars: 0, images: 0, withheld: 0, sensitive: 0, keptLocal: 0 }), personal };
}

/** Plain-language description of one call, used on the submission page. */
export function describeCall(c: AiCall): string {
  if (c.status === "skipped_confidential") return "Checked locally. Nothing was sent to any AI provider.";
  const masked: string[] = [];
  for (const r of c.redactionCounts) masked.push(`${r.count} ${label(r.type, r.count)}`);
  if (c.sensitiveTermsMasked) masked.push(`${c.sensitiveTermsMasked} sensitive term${c.sensitiveTermsMasked === 1 ? "" : "s"}`);
  const parts = [masked.length ? `${masked.join(", ")} masked` : "nothing needed masking"];
  if (c.withheldSections) parts.push(`${c.withheldSections} section${c.withheldSections === 1 ? "" : "s"} withheld`);
  const what = c.purpose === "judge" ? "claim and tone judging" : c.purpose === "vision" ? "reading the image" : "drafting a rule clarification";
  const outcome = c.status === "ok" ? "" : ` The call ${c.status === "timeout" ? "timed out" : "failed"}${c.error ? `: ${c.error}` : ""}.`;
  return `Sent ${c.charsSent.toLocaleString("en-IN")} characters (${parts.join("; ")}) to ${c.provider} ${c.model ?? ""} for ${what}. ${
    c.imageSent ? "The image was sent." : "No image was sent."
  }${outcome}`;
}

function label(type: string, n: number) {
  const map: Record<string, [string, string]> = {
    email: ["email address", "email addresses"],
    phone: ["phone number", "phone numbers"],
    aadhaar: ["Aadhaar-like ID", "Aadhaar-like IDs"],
    pan: ["PAN-like ID", "PAN-like IDs"],
  };
  const m = map[type];
  return m ? (n === 1 ? m[0] : m[1]) : type;
}
