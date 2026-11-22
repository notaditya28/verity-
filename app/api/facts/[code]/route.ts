import { NextResponse } from "next/server";
import { updateFact } from "@/lib/facts";
import { factEditSchema, zodMessage } from "@/lib/validation";
import { jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Editing a fact creates a new policy version and fact row (old row kept), then runs Fact Drift. */
export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z]+-\d+$/.test(code)) return jsonError("Invalid fact code", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = factEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);

  try {
    const result = await updateFact(code, parsed.data);
    if (result.status === "not_found") return jsonError("Fact not found", 404);
    if (result.status === "unchanged") return NextResponse.json({ unchanged: true });
    return NextResponse.json({ unchanged: false, policyVersion: result.policyVersion, drift: result.drift });
  } catch (err) {
    console.error(err);
    return jsonError("Could not update the fact. Please try again.", 500);
  }
}
