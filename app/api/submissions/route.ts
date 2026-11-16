import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { runCheck } from "@/lib/checks/run";
import { createSubmissionSchema, zodMessage } from "@/lib/validation";
import { getRole } from "@/lib/role";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const role = await getRole();

  try {
    const db = getDb();
    const { submission, version } = await db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(schema.submissions)
        .values({
          orgId: DEMO_ORG_ID,
          title: input.title,
          channel: input.channel,
          goal: input.goal,
          audience: input.audience,
          cta: input.cta,
          createdByRole: role,
        })
        .returning();
      const [version] = await tx
        .insert(schema.submissionVersions)
        .values({
          submissionId: submission.id,
          versionNumber: 1,
          text: input.text,
          imageUrl: input.imageDataUrl ?? null,
          altText: input.altText || null,
        })
        .returning();
      await tx.insert(schema.auditLog).values({
        orgId: DEMO_ORG_ID,
        actorRole: role,
        action: "submission.created",
        entity: "submission",
        entityId: submission.id,
        details: { title: input.title, channel: input.channel, hasImage: !!input.imageDataUrl },
      });
      return { submission, version };
    });

    try {
      await runCheck(version.id);
    } catch (err) {
      // The submission is saved; the results page shows the failed check with a retry option.
      console.error("check failed", err);
    }
    return NextResponse.json({ id: submission.id });
  } catch (err) {
    console.error("create submission failed", err);
    return NextResponse.json({ error: "Could not save the submission. Please try again." }, { status: 500 });
  }
}
