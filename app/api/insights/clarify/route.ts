import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { aiCall } from "@/lib/ai/gateway";
import { friendlyAiError, geminiConfigured } from "@/lib/ai/gemini";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { loadInsights } from "@/lib/insights/queries";
import { buildClarifyPrompt, CLARIFY_PROMPT_VERSION, CLARIFY_RESPONSE_SCHEMA, CLARIFY_SYSTEM } from "@/lib/prompts/clarify";
import { clarifyRequestSchema, clarifySuggestionSchema, zodMessage } from "@/lib/validation";
import { audit, jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Manager: ask the AI for a clarified rule, a new rule or a new fact for one gap. Sends only the rule text and
 * anonymised quotes / dispute reasons from non-confidential submissions, through the AI gateway (masked + logged).
 * The suggestion is returned for review; nothing changes until the manager accepts it.
 */
export async function POST(req: Request) {
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = clarifyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  if (!geminiConfigured()) return jsonError("AI is not configured, so suggestions can't be drafted. You can still edit the rule by hand.", 503);

  try {
    const insights = await loadInsights();
    const gap = insights.gaps.find((g) => g.kind === parsed.data.kind && g.key === parsed.data.key);
    if (!gap) return jsonError("That insight is no longer in the list. Refresh the page.", 404);
    const rule = gap.kind === "unclear_rule" ? insights.currentRules.get(gap.key) : undefined;
    const terms = (
      await getDb()
        .select({ term: schema.sensitiveTerms.term })
        .from(schema.sensitiveTerms)
        .where(and(eq(schema.sensitiveTerms.orgId, DEMO_ORG_ID), eq(schema.sensitiveTerms.active, true)))
    ).map((t) => t.term);

    let raw: unknown;
    try {
      ({ data: raw } = await aiCall({
        purpose: "clarification",
        orgId: DEMO_ORG_ID,
        promptVersion: CLARIFY_PROMPT_VERSION,
        confidential: false,
        sensitiveTerms: terms,
        system: CLARIFY_SYSTEM,
        prompt: buildClarifyPrompt(gap, rule ? { code: gap.key, title: rule.title, description: rule.description } : undefined),
        schema: CLARIFY_RESPONSE_SCHEMA,
        timeoutMs: 20_000,
      }));
    } catch (err) {
      return jsonError(`The AI couldn't draft a suggestion (${friendlyAiError(err)}). Try again in a moment.`, 502);
    }
    const s = clarifySuggestionSchema.safeParse(raw);
    if (!s.success) return jsonError("The AI returned an unexpected suggestion. Try again.", 502);
    await audit("manager", "insight.clarification_drafted", "insight", gap.key, { kind: gap.kind, suggestion: s.data.kind });
    return NextResponse.json({ suggestion: s.data, gap: { kind: gap.kind, key: gap.key }, rule: rule ? { code: gap.key, title: rule.title, description: rule.description } : null });
  } catch (err) {
    console.error(err);
    return jsonError("Could not draft a suggestion. Please try again.", 500);
  }
}
