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
  try {
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
    if (args.image) parts.push({ inlineData: { mimeType: args.image.mimeType, data: args.image.base64 } });
    parts.push({ text: args.prompt });
    const res = await getClient().models.generateContent({
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
