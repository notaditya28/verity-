import "server-only";
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && !!process.env.GEMINI_MODEL;
}

export function geminiModel(): string {
  const m = process.env.GEMINI_MODEL;
  if (!m) throw new Error("GEMINI_MODEL is not set");
  return m;
}

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`AI request timed out after ${Math.round(ms / 1000)}s`);
  }
}

/**
 * Short, readable error text for the UI and audit log. Gemini API errors arrive as a JSON string; we keep the status
 * code and the first sentence of the message instead of showing raw JSON.
 */
export function friendlyAiError(err: unknown): string {
  if (err instanceof AiTimeoutError) return err.message;
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"))) as { error?: { code?: number; message?: string } };
    if (j.error?.message) {
      const first = j.error.message.split(/(?<=\.)\s/)[0];
      return `Gemini error${j.error.code ? ` ${j.error.code}` : ""}: ${first}`.slice(0, 200);
    }
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 200);
}

/** One structured-JSON call at temperature 0, with a hard timeout. Returns the raw parsed JSON (validate with zod!). */
export async function generateJson(args: {
  system: string;
  prompt: string;
  schema: unknown;
  timeoutMs: number;
  image?: { mimeType: string; base64: string };
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const started = Date.now();
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (args.image) parts.push({ inlineData: { mimeType: args.image.mimeType, data: args.image.base64 } });
  parts.push({ text: args.prompt });
  const call = () =>
    getClient().models.generateContent({
      model: geminiModel(),
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: args.system,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: args.schema,
        abortSignal: controller.signal,
      },
    });
  try {
    let res;
    try {
      res = await call();
    } catch (err) {
      // One quick retry for "busy" answers (429 rate limit, 503 overloaded) that come back fast, if time allows.
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /"code":\s*(429|503)|\b(429|503)\b/.test(msg);
      if (!transient || controller.signal.aborted || Date.now() - started > args.timeoutMs / 3) throw err;
      await new Promise((r) => setTimeout(r, 1500));
      res = await call();
    }
    const text = res.text;
    if (!text) throw new Error("AI returned an empty response");
    return JSON.parse(text);
  } catch (err) {
    if (controller.signal.aborted) throw new AiTimeoutError(args.timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
