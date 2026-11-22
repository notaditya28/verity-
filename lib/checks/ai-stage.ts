import "server-only";
import { friendlyAiError, geminiConfigured, geminiModel } from "../ai/gemini";
import { aiCall } from "../ai/gateway";
import { buildJudgePrompt, JUDGE_RESPONSE_SCHEMA, JUDGE_SYSTEM, PROMPT_VERSION } from "../prompts/judge";
import { pgTextRetriever, type Retriever } from "./retrieve";
import type { CheckContext, DraftFinding, DraftUsage } from "./types";
import { validateAiFindings, type ValidationStats } from "./validate-ai";

export const AI_TIMEOUT_MS = 22_000;

export type AiStageResult =
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; model: string; promptVersion: string }
  | {
      status: "completed";
      findings: DraftFinding[];
      usages: DraftUsage[];
      stats: ValidationStats;
      model: string;
      promptVersion: string;
      retrieved: { rules: string[]; facts: string[] };
    };

/**
 * Retrieval + one Gemini judgement call + validation. Never throws: failures are returned
 * so the caller can keep the deterministic findings.
 */
export async function runAiStage(args: {
  orgId: string;
  orgName: string;
  channel: string;
  goal: string;
  audience: string;
  cta: string;
  text: string; // original text (spans are computed against this)
  redactedContent: string; // content for the prompt; the AI gateway sanitises the whole prompt before sending
  extractedText: string | null;
  ctx: CheckContext;
  deterministic: DraftFinding[];
  retriever?: Retriever;
  timeoutMs?: number;
  /** For the AI-use log and the sanitiser. */
  submissionId?: string | null;
  checkId?: string | null;
  confidential?: boolean;
  sensitiveTerms?: string[];
  withheld?: string[];
}): Promise<AiStageResult> {
  if (args.confidential) return { status: "skipped", reason: "Confidential: AI tone and claim checks were kept local. Nothing was sent to any AI provider." };
  if (!geminiConfigured()) return { status: "skipped", reason: "AI checks are off: GEMINI_API_KEY / GEMINI_MODEL not set." };
  const model = geminiModel();
  try {
    const retrieved = await (args.retriever ?? pgTextRetriever).retrieve(args.orgId, args.redactedContent, {
      rules: args.ctx.rules,
      facts: args.ctx.facts,
    });
    const prompt = buildJudgePrompt({
      orgName: args.orgName,
      channel: args.channel,
      goal: args.goal,
      audience: args.audience,
      cta: args.cta,
      content: args.redactedContent,
      rules: retrieved.rules,
      facts: retrieved.facts,
      alreadyFound: args.deterministic,
    });
    const { data: raw, model: usedModel } = await aiCall({
      purpose: "judge",
      orgId: args.orgId,
      submissionId: args.submissionId,
      checkId: args.checkId,
      promptVersion: PROMPT_VERSION,
      confidential: false,
      sensitiveTerms: args.sensitiveTerms,
      withheld: args.withheld,
      system: JUDGE_SYSTEM,
      prompt,
      schema: JUDGE_RESPONSE_SCHEMA,
      timeoutMs: args.timeoutMs ?? AI_TIMEOUT_MS,
    });
    const { findings, stats, usages } = validateAiFindings(raw, {
      text: args.text,
      extractedText: args.extractedText,
      retrievedRules: retrieved.rules,
      retrievedFacts: retrieved.facts,
      deterministic: args.deterministic,
    });
    return {
      status: "completed",
      findings,
      usages,
      stats,
      model: usedModel,
      promptVersion: PROMPT_VERSION,
      retrieved: { rules: retrieved.rules.map((r) => r.code), facts: retrieved.facts.map((f) => f.code) },
    };
  } catch (err) {
    console.error("AI stage failed:", err instanceof Error ? err.message : err);
    return { status: "failed", error: friendlyAiError(err), model, promptVersion: PROMPT_VERSION };
  }
}
