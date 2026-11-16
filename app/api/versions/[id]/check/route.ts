import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { runCheck } from "@/lib/checks/run";
import { uuidSchema } from "@/lib/validation";
import { EDITABLE_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-runs the check on a version. Only while the submission is with the creator, so an approved result can't change. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid version id" }, { status: 400 });
  try {
    const [row] = await getDb()
      .select({ status: schema.submissions.status, orgId: schema.submissions.orgId })
      .from(schema.submissionVersions)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.submissionVersions.submissionId))
      .where(eq(schema.submissionVersions.id, id))
      .limit(1);
    if (!row || row.orgId !== DEMO_ORG_ID) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    if (!(EDITABLE_STATUSES as readonly string[]).includes(row.status)) {
      return NextResponse.json({ error: "This submission is with the reviewer or approved, so it can't be re-checked." }, { status: 409 });
    }
    const result = await runCheck(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("re-run check failed", err);
    return NextResponse.json({ error: "The check could not run. Please try again." }, { status: 500 });
  }
}
