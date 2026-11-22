import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { DEMO_ORG_ID } from "../demo/constants";
import { normalizeQuote, passRateByChannel, rankGaps, type FirstCheck, type InsightFinding } from "./rank";

/**
 * Findings from the latest check of every version, joined with the submission and the manager's latest decision,
 * then deduplicated per submission + rule + normalised quote (a dispute carried into v2 counts once).
 */
export async function loadInsightFindings(orgId = DEMO_ORG_ID): Promise<InsightFinding[]> {
  const rows = await getDb().execute<{
    sid: string;
    title: string;
    channel: string;
    confidential: boolean;
    status: string;
    rule_code: string | null;
    fact_code: string | null;
    source: "rule" | "ai";
    label: string | null;
    severity: string;
    quote: string | null;
    creator_decision: InsightFinding["decision"];
    dispute_reason: string | null;
    manager_action: InsightFinding["managerDecision"];
  }>(sql`
    with latest as (
      select distinct on (c.submission_version_id) c.id, c.submission_version_id
      from ${schema.checks} c order by c.submission_version_id, c.started_at desc
    ),
    md as (
      select distinct on (d.submission_id) d.submission_id, d.action
      from ${schema.decisions} d where d.role = 'manager' order by d.submission_id, d.created_at desc
    )
    select s.id as sid, s.title, s.channel, s.confidential, s.status,
           f.rule_code, f.fact_code, f.source, f.label, f.severity, f.quote, f.creator_decision, f.dispute_reason,
           md.action as manager_action
    from ${schema.findings} f
    join latest l on l.id = f.check_id
    join ${schema.submissionVersions} v on v.id = l.submission_version_id
    join ${schema.submissions} s on s.id = v.submission_id
    left join md on md.submission_id = s.id
    where s.org_id = ${orgId}`);
  const best = new Map<string, InsightFinding>();
  for (const r of rows) {
    const f: InsightFinding = {
      submissionId: r.sid,
      title: r.title,
      channel: r.channel,
      confidential: r.confidential,
      status: r.status,
      ruleCode: r.rule_code,
      factCode: r.fact_code,
      source: r.source,
      label: r.label,
      severity: r.severity,
      quote: r.quote,
      decision: r.creator_decision,
      disputeReason: r.dispute_reason,
      managerDecision: r.manager_action,
    };
    const key = `${f.submissionId}|${f.ruleCode ?? f.source}|${normalizeQuote(f.quote ?? "")}`;
    const prev = best.get(key);
    if (!prev || (prev.decision !== "disputed" && f.decision === "disputed")) best.set(key, f);
  }
  return [...best.values()];
}

/** The first check of each submission's first version: did it pass (no findings), and which rules fired? */
export async function loadFirstChecks(orgId = DEMO_ORG_ID): Promise<FirstCheck[]> {
  const rows = await getDb().execute<{ sid: string; channel: string; findings: number; rules: string[] | null }>(sql`
    with first as (
      select distinct on (s.id) s.id as sid, s.channel, c.id as cid
      from ${schema.submissions} s
      join ${schema.submissionVersions} v on v.submission_id = s.id and v.version_number = 1
      join ${schema.checks} c on c.submission_version_id = v.id
      where s.org_id = ${orgId}
      order by s.id, c.started_at asc
    )
    select first.sid, first.channel, count(f.id)::int as findings,
           array_remove(array_agg(distinct f.rule_code), null) as rules
    from first left join ${schema.findings} f on f.check_id = first.cid
    group by first.sid, first.channel`);
  return rows.map((r) => ({ submissionId: r.sid, channel: r.channel, findings: r.findings, ruleCodes: r.rules ?? [] }));
}

/** Uncited AI items downgraded across all checks (from each check's validation stats in the audit log). */
export async function uncitedTotal(orgId = DEMO_ORG_ID): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    select coalesce(sum((details->'ai'->'validation'->>'downgradedCitation')::int), 0)::int as n
    from ${schema.auditLog}
    where org_id = ${orgId} and action in ('check.completed', 'check.partial') and details->'ai'->'validation' is not null`);
  return row?.n ?? 0;
}

export async function loadInsights(orgId = DEMO_ORG_ID) {
  const db = getDb();
  const [findings, first, uncited, rules] = await Promise.all([
    loadInsightFindings(orgId),
    loadFirstChecks(orgId),
    uncitedTotal(orgId),
    db.select({ code: schema.rules.code, title: schema.rules.title, description: schema.rules.description, current: schema.rules.current }).from(schema.rules).where(eq(schema.rules.orgId, orgId)),
  ]);
  const current = new Map(rules.filter((r) => r.current).map((r) => [r.code, r]));
  const gaps = rankGaps(findings, (code) => current.get(code)?.title ?? code, uncited);
  const byChannel = passRateByChannel(first);
  const passed = first.filter((c) => c.findings === 0).length;
  const openDisputes = findings.filter((f) => f.decision === "disputed" && f.status !== "approved").length;
  // Per-rule dispute counts for the hints on /brand.
  const ruleStats = new Map<string, { findings: number; disputes: number }>();
  for (const f of findings) {
    if (!f.ruleCode) continue;
    const e = ruleStats.get(f.ruleCode) ?? { findings: 0, disputes: 0 };
    e.findings++;
    if (f.decision === "disputed") e.disputes++;
    ruleStats.set(f.ruleCode, e);
  }
  return {
    gaps,
    byChannel,
    ruleStats,
    kpis: {
      submissionsChecked: first.length,
      firstCheckPassRatePct: first.length ? Math.round((100 * passed) / first.length) : 0,
      firstCheckPassed: passed,
      openDisputes,
      uncoveredTopics: gaps.filter((g) => g.kind === "uncovered_topic").length,
    },
    currentRules: current,
  };
}
