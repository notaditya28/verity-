import "server-only";
import { createHash } from "node:crypto";
import { getDb, schema } from "../db";
import { AiTimeoutError, friendlyAiError, generateJson, geminiModel } from "./gemini";
import { sanitizeForAi } from "./sanitize";

/**
 * The ONLY way Verity calls an external AI. It refuses confidential content, sanitises the whole prompt, and writes
 * one ai_calls row per call with counts and a SHA-256 of what was sent — never the payload itself.
 */
export const AI_PROVIDER = "Google Gemini";

export type AiPurpose = "judge" | "vision" | "clarification";

export interface AiRequest {
  system: string;
  prompt: string;
  schema: unknown;
  timeoutMs: number;
  image?: { mimeType: string; base64: string };
}
export type AiTransport = (req: AiRequest) => Promise<{ data: unknown; model: string }>;
export type AiCallRow = typeof schema.aiCalls.$inferInsert;
export type AiLogSink = (row: AiCallRow) => Promise<void>;

const defaultSink: AiLogSink = async (row) => {
  try {
    await getDb().insert(schema.aiCalls).values(row);
  } catch (err) {
    console.error("ai_calls log failed", err); // logging must never break a check
  }
};

let transport: AiTransport = generateJson;
let sink: AiLogSink = defaultSink;

/** Test hooks: intercept the AI client and the log (pass null to restore the defaults). */
export function setAiTransport(t: AiTransport | null) {
  transport = t ?? generateJson;
}
export function setAiLogSink(s: AiLogSink | null) {
  sink = s ?? defaultSink;
}

export class ConfidentialAiError extends Error {
  constructor() {
    super("Refused: this content is confidential and may not be sent to a third-party AI.");
  }
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export interface AiCallArgs extends AiRequest {
  purpose: AiPurpose;
  orgId: string;
  submissionId?: string | null;
  checkId?: string | null;
  promptVersion: string;
  confidential: boolean;
  sensitiveTerms?: string[];
  withheld?: string[];
}

export async function aiCall(args: AiCallArgs): Promise<{ data: unknown; model: string }> {
  if (args.confidential) throw new ConfidentialAiError(); // guard: confidential content never reaches the transport
  const clean = sanitizeForAi(args.prompt, { sensitiveTerms: args.sensitiveTerms, withheld: args.withheld });
  const imageHash = args.image ? sha256(args.image.base64) : "";
  const base: AiCallRow = {
    orgId: args.orgId,
    submissionId: args.submissionId ?? null,
    checkId: args.checkId ?? null,
    purpose: args.purpose,
    provider: AI_PROVIDER,
    model: safeModel(),
    promptVersion: args.promptVersion,
    charsSent: args.system.length + clean.text.length,
    imageSent: !!args.image,
    redactionCounts: clean.redactions,
    withheldSections: clean.withheldSections,
    sensitiveTermsMasked: clean.sensitiveTermsMasked,
    payloadSha256: sha256(`${args.system}\n${clean.text}\n${imageHash}`),
    status: "ok",
  };
  const t0 = Date.now();
  try {
    const res = await transport({ system: args.system, prompt: clean.text, schema: args.schema, timeoutMs: args.timeoutMs, image: args.image });
    await sink({ ...base, model: res.model, latencyMs: Date.now() - t0 });
    return res;
  } catch (err) {
    await sink({ ...base, status: err instanceof AiTimeoutError ? "timeout" : "error", latencyMs: Date.now() - t0, error: friendlyAiError(err) });
    throw err;
  }
}

/** Records that a confidential check was kept local (no payload, nothing sent). */
export async function logKeptLocal(args: { orgId: string; submissionId: string; checkId: string; purpose: AiPurpose }) {
  await sink({
    orgId: args.orgId,
    submissionId: args.submissionId,
    checkId: args.checkId,
    purpose: args.purpose,
    provider: AI_PROVIDER,
    model: null,
    promptVersion: null,
    charsSent: 0,
    imageSent: false,
    status: "skipped_confidential",
  });
}

function safeModel(): string | null {
  try {
    return geminiModel();
  } catch {
    return null;
  }
}
