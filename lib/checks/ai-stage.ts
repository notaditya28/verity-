import "server-only";
import { generateJson, geminiConfigured, geminiModel } from "../ai/gemini";
import { buildJudgePrompt, JUDGE_RESPONSE_SCHEMA, JUDGE_SYSTEM, PROMPT_VERSION } from "../prompts/judge";
import { pgTextRetriever, type Retriever } from "./retrieve";
import type { CheckContext, DraftFinding } from "./types";
import { validateAiFindings, type ValidationStats } from "./validate-ai";

export const AI_TIMEOUT_MS = 22_000;

export type AiStageResult =
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; model: string; promptVersion: string }
  | {
      status: "completed";
      findings: DraftFinding[];
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
  redactedContent: string; // what the model sees
  extractedText: string | null;
  ctx: CheckContext;
  deterministic: DraftFinding[];
  retriever?: Retriever;
  timeoutMs?: number;
}): Promise<AiStageResult> {
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
    const raw = await generateJson({ system: JUDGE_SYSTEM, prompt, schema: JUDGE_RESPONSE_SCHEMA, timeoutMs: args.timeoutMs ?? AI_TIMEOUT_MS });
    const { findings, stats } = validateAiFindings(raw, {
      text: args.text,
      extractedText: args.extractedText,
      retrievedRules: retrieved.rules,
      retrievedFacts: retrieved.facts,
      deterministic: args.deterministic,
    });
    return {
      status: "completed",
      findings,
      stats,
      model,
      promptVersion: PROMPT_VERSION,
      retrieved: { rules: retrieved.rules.map((r) => r.code), facts: retrieved.facts.map((f) => f.code) },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("AI stage failed:", msg);
    return { status: "failed", error: msg.slice(0, 300), model, promptVersion: PROMPT_VERSION };
  }
}
