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

/** Formats a zod error as one friendly sentence for the UI. */
export function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(". ");
}
