import { z } from "zod";

export const channelSchema = z.enum(["instagram", "ad", "email", "document", "other"]);

export const createSubmissionSchema = z
  .object({
    title: z.string().trim().min(1, "Add a title").max(120),
    channel: channelSchema,
    goal: z.string().trim().max(300).default(""),
    audience: z.string().trim().max(300).default(""),
    cta: z.string().trim().max(200).default(""),
    text: z.string().max(5000, "Keep the text under 5,000 characters").default(""),
    // data:image/...;base64 — capped at ~1.5 MB of base64
    imageDataUrl: z
      .string()
      .regex(/^data:image\/(png|jpeg|webp);base64,/, "Upload a PNG, JPEG or WebP image")
      .max(2_000_000, "Image is too large (max ~1.5 MB)")
      .optional(),
    altText: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.text.trim().length > 0 || !!v.imageDataUrl, { message: "Add some text or an image to check", path: ["text"] });

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const uuidSchema = z.string().uuid();

export const findingDecisionSchema = z
  .object({
    decision: z.enum(["pending", "accepted", "edited", "disputed"]),
    editedFix: z.string().max(1000).optional(),
    disputeReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== "edited" || v.editedFix !== undefined, { message: "Enter your edited fix", path: ["editedFix"] })
  .refine((v) => v.decision !== "disputed" || (v.disputeReason?.length ?? 0) >= 3, {
    message: "Give a short reason for the dispute",
    path: ["disputeReason"],
  });

export const managerDecisionSchema = z
  .object({
    action: z.enum(["approve", "request_changes", "escalate"]),
    comment: z.string().trim().max(1000).default(""),
  })
  .refine((v) => v.action === "approve" || v.comment.length >= 3, {
    message: "Add a comment so the creator (or Legal) knows what to do",
    path: ["comment"],
  });

export const factEditSchema = z.object({
  value: z.string().trim().min(1, "Value can't be empty").max(200),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .optional(),
  note: z.string().trim().max(200).optional(),
});

/** Formats a zod error as one friendly sentence for the UI. */
export function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(". ");
}

export const driftActionSchema = z
  .object({
    action: z.enum(["send_back", "dismiss"]),
    reason: z.string().trim().max(500).default(""),
  })
  .refine((v) => v.action !== "dismiss" || v.reason.length >= 3, {
    message: "Give a short reason for dismissing (e.g. the post is archived)",
    path: ["reason"],
  });
