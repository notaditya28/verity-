import "server-only";
import { z } from "zod";
import { generateJson } from "../ai/gemini";
import { VISION_PROMPT, VISION_RESPONSE_SCHEMA, VISION_SYSTEM } from "../prompts/vision";
export { dominantColours, measureTextBlocks, type DominantColour, type MeasuredBlock } from "./pixels";

export const VISION_TIMEOUT_MS = 13_000;

export function decodeDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], "base64") };
}

const hex = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/)
  .transform((s) => (s.startsWith("#") ? s : `#${s}`).toUpperCase());

const visionSchema = z.object({
  text: z.string().max(4000),
  description: z.string().max(1000),
  text_blocks: z
    .array(
      z.object({
        text: z.string(),
        box: z.array(z.number()),
        text_color: hex.catch("#000000"),
        background_color: hex.catch("#FFFFFF"),
      }),
    )
    .max(12)
    .catch([]),
});
export type VisionResult = z.infer<typeof visionSchema>;

/** Gemini vision: OCR + description + text-block boxes. Output is zod-validated. Throws on failure. */
export async function readImage(img: { mimeType: string; buffer: Buffer }): Promise<VisionResult> {
  const raw = await generateJson({
    system: VISION_SYSTEM,
    prompt: VISION_PROMPT,
    schema: VISION_RESPONSE_SCHEMA,
    timeoutMs: VISION_TIMEOUT_MS,
    image: { mimeType: img.mimeType, base64: img.buffer.toString("base64") },
  });
  const parsed = visionSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Image reading returned an unexpected shape");
  return { ...parsed.data, text: parsed.data.text.trim(), description: parsed.data.description.trim() };
}

