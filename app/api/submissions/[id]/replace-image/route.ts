import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { runCheck } from "@/lib/checks/run";
import { uuidSchema, zodMessage } from "@/lib/validation";
import { audit, EDITABLE_STATUSES, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/, "Upload a PNG, JPEG or WebP image")
    .max(2_000_000, "Image is too large (max ~1.5 MB)"),
  altText: z.string().trim().max(500).optional(),
});

/** Creator: upload a corrected image as the next version (text kept), then re-check it. Image findings resolve on re-check. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid submission id", 400);
  const denied = await requireRole("creator");
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  try {
    const data = await loadLatest(id);
    if (!data) return jsonError("Submission not found", 404);
    const { submission, version } = data;
    if (!(EDITABLE_STATUSES as readonly string[]).includes(submission.status)) {
      return jsonError("This submission is with the reviewer and can't be changed right now.", 409);
    }
    const db = getDb();
    const nextNumber = version.versionNumber + 1;
    const [newVersion] = await db
      .insert(schema.submissionVersions)
      .values({
        submissionId: id,
        versionNumber: nextNumber,
        text: version.text,
        imageUrl: parsed.data.imageDataUrl,
        altText: parsed.data.altText || version.altText,
        // New image: read it again (or, if confidential, analyse it locally).
        extractedText: null,
        visualDescription: null,
        imageAnalysis: null,
      })
      .returning();
    await db.update(schema.submissions).set({ currentVersion: nextNumber, status: "draft", updatedAt: new Date() }).where(eq(schema.submissions.id, id));
    await audit("creator", "version.created", "submission", id, { from: version.versionNumber, to: nextNumber, imageReplaced: true });
    let checkError: string | null = null;
    try {
      await runCheck(newVersion.id);
    } catch (err) {
      checkError = err instanceof Error ? err.message : String(err);
    }
    return NextResponse.json({ versionNumber: nextNumber, checkError });
  } catch (err) {
    console.error(err);
    return jsonError("Could not replace the image. Please try again.", 500);
  }
}
