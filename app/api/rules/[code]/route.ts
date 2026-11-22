import { NextResponse } from "next/server";
import { updateRule } from "@/lib/rules";
import { ruleUpdateSchema, zodMessage } from "@/lib/validation";
import { jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: new version of a rule (e.g. an accepted clarification). The next check uses it. */
export async function PUT(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z]+-\d+$/.test(code)) return jsonError("Invalid rule code", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = ruleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  try {
    const res = await updateRule(code, parsed.data);
    if (!res) return jsonError("Rule not found", 404);
    return NextResponse.json(res.unchanged ? { unchanged: true } : { code, policyVersion: res.policyVersion });
  } catch (err) {
    console.error(err);
    return jsonError("Could not update the rule. Please try again.", 500);
  }
}
