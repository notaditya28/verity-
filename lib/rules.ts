import "server-only";
import { and, desc, eq, like } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Rule } from "./db/schema";
import { DEMO_ORG_ID } from "./demo/constants";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function nextPolicyVersion(tx: Tx, note: string) {
  const [latest] = await tx
    .select()
    .from(schema.policyVersions)
    .where(eq(schema.policyVersions.orgId, DEMO_ORG_ID))
    .orderBy(desc(schema.policyVersions.versionNumber))
    .limit(1);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const [pv] = await tx.insert(schema.policyVersions).values({ orgId: DEMO_ORG_ID, versionNumber, note }).returning();
  return pv;
}

/** New version of an existing rule: new policy version + new rule row; the old row stays (current = false). */
export async function updateRule(code: string, input: { title: string; description: string; note?: string }) {
  return getDb().transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(schema.rules)
      .where(and(eq(schema.rules.orgId, DEMO_ORG_ID), eq(schema.rules.code, code), eq(schema.rules.current, true)))
      .limit(1);
    if (!old) return null;
    if (old.title === input.title && old.description === input.description) return { unchanged: true as const, rule: old };
    const pv = await nextPolicyVersion(tx, input.note || `Clarified ${code}`);
    await tx.update(schema.rules).set({ current: false }).where(eq(schema.rules.id, old.id));
    const [created] = await tx
      .insert(schema.rules)
      .values({
        orgId: DEMO_ORG_ID,
        code,
        category: old.category,
        title: input.title,
        description: input.description,
        severity: old.severity,
        checkType: old.checkType,
        params: old.params,
        active: old.active,
        current: true,
        policyVersionId: pv.id,
      })
      .returning();
    await tx.insert(schema.auditLog).values({
      orgId: DEMO_ORG_ID,
      actorRole: "manager",
      action: "rule.updated",
      entity: "rule",
      entityId: code,
      details: { old: { title: old.title, description: old.description }, new: { title: created.title, description: created.description }, policyVersion: pv.versionNumber },
    });
    return { unchanged: false as const, rule: created, policyVersion: pv.versionNumber };
  });
}

const PREFIX: Record<Rule["category"], string> = { tone: "T", terminology: "TERM", claims: "C", accessibility: "A", visual: "V", asci: "ASCI", messaging: "M" };

/** A new AI-judged rule (for a topic the policy didn't cover), with the next free code in its category. */
export async function createRule(input: { title: string; description: string; category: Rule["category"]; severity: Rule["severity"] }) {
  return getDb().transaction(async (tx) => {
    const prefix = PREFIX[input.category];
    const existing = await tx
      .select({ code: schema.rules.code })
      .from(schema.rules)
      .where(and(eq(schema.rules.orgId, DEMO_ORG_ID), like(schema.rules.code, `${prefix}-%`)));
    const next = Math.max(0, ...existing.map((r) => parseInt(r.code.split("-").pop() ?? "0", 10)).filter((n) => !Number.isNaN(n))) + 1;
    const code = `${prefix}-${String(next).padStart(2, "0")}`;
    const pv = await nextPolicyVersion(tx, `Added ${code}: ${input.title}`);
    const [created] = await tx
      .insert(schema.rules)
      .values({ orgId: DEMO_ORG_ID, code, category: input.category, title: input.title, description: input.description, severity: input.severity, checkType: "ai", policyVersionId: pv.id })
      .returning();
    await tx.insert(schema.auditLog).values({
      orgId: DEMO_ORG_ID,
      actorRole: "manager",
      action: "rule.created",
      entity: "rule",
      entityId: code,
      details: { title: input.title, description: input.description, checkType: "ai", policyVersion: pv.versionNumber },
    });
    return { rule: created, policyVersion: pv.versionNumber };
  });
}

/** A new fact (from an insight): the owner supplies value and source; a new policy version is created. */
export async function createFact(input: { subject: string; attribute: string; value: string; unit?: string; owner: string; sourceDoc: string; validUntil?: string | null }) {
  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ code: schema.facts.code }).from(schema.facts).where(eq(schema.facts.orgId, DEMO_ORG_ID));
    const next = Math.max(0, ...existing.map((f) => parseInt(f.code.replace(/\D/g, ""), 10)).filter((n) => !Number.isNaN(n))) + 1;
    const code = `F-${next}`;
    const pv = await nextPolicyVersion(tx, `Added ${code}: ${input.subject}, ${input.attribute}`);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const [created] = await tx
      .insert(schema.facts)
      .values({
        orgId: DEMO_ORG_ID,
        code,
        subject: input.subject,
        attribute: input.attribute,
        value: input.value,
        unit: input.unit || null,
        owner: input.owner,
        sourceDoc: input.sourceDoc,
        validFrom: today,
        validUntil: input.validUntil ?? null,
        current: true,
        policyVersionId: pv.id,
      })
      .returning();
    await tx.insert(schema.auditLog).values({
      orgId: DEMO_ORG_ID,
      actorRole: "manager",
      action: "fact.created",
      entity: "fact",
      entityId: code,
      details: { subject: input.subject, attribute: input.attribute, value: input.value, source: input.sourceDoc, policyVersion: pv.versionNumber },
    });
    return { fact: created, policyVersion: pv.versionNumber };
  });
}
