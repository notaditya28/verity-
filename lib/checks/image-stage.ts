import "server-only";
import { eq } from "drizzle-orm";
import { geminiConfigured } from "../ai/gemini";
import { getDb, schema } from "../db";
import type { SubmissionVersion } from "../db/schema";
import { decodeDataUrl, dominantColours, measureTextBlocks, readImage } from "../images/analyze";
import type { ImageFacts } from "./image-checks";

export interface ImageStageResult {
  facts: ImageFacts;
  extractedText: string | null;
  /** True when Gemini read the image during this check (used to budget the judge call's time). */
  readNow: boolean;
  /** Set when the image text could not be read (AI failure). Palette and alt-text checks still run. */
  error: string | null;
  skippedReason: string | null;
}

/**
 * Prepares an image for checking: dominant colours (sharp + node-vibrant), and, once per version, Gemini vision
 * OCR + description + text-block colours measured from the pixels. Results are saved on the version so a
 * re-check reuses them. Never throws.
 */
export async function runImageStage(version: SubmissionVersion): Promise<ImageStageResult | null> {
  if (!version.imageUrl) return null;
  const img = decodeDataUrl(version.imageUrl);
  const base: ImageFacts = { altText: version.altText, description: version.visualDescription, colours: [], blocks: [] };
  if (!img) return { facts: base, extractedText: null, readNow: false, error: "The image could not be decoded.", skippedReason: null };

  let colours = version.imageAnalysis?.colours ?? null;
  if (!colours) {
    try {
      colours = await dominantColours(img.buffer);
    } catch (err) {
      console.error("palette extraction failed", err);
      colours = [];
    }
  }

  // Already read for this version: reuse.
  if (version.extractedText !== null) {
    return {
      facts: { ...base, colours, blocks: version.imageAnalysis?.blocks ?? [] },
      extractedText: version.extractedText,
      readNow: false,
      error: null,
      skippedReason: null,
    };
  }

  const db = getDb();
  if (!geminiConfigured()) {
    await db.update(schema.submissionVersions).set({ imageAnalysis: { blocks: [], colours } }).where(eq(schema.submissionVersions.id, version.id));
    return {
      facts: { ...base, colours },
      extractedText: null,
      readNow: false,
      error: null,
      skippedReason: "Text in the image was not read because AI is off.",
    };
  }

  try {
    const vision = await readImage(img);
    const blocks = await measureTextBlocks(img.buffer, vision.text_blocks);
    await db
      .update(schema.submissionVersions)
      .set({ extractedText: vision.text, visualDescription: vision.description || null, imageAnalysis: { blocks, colours } })
      .where(eq(schema.submissionVersions.id, version.id));
    return {
      facts: { ...base, description: vision.description || null, colours, blocks },
      extractedText: vision.text,
      readNow: true,
      error: null,
      skippedReason: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("image reading failed:", msg);
    return { facts: { ...base, colours }, extractedText: null, readNow: true, error: `Could not read the image text: ${msg.slice(0, 200)}`, skippedReason: null };
  }
}
