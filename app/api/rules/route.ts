import { NextResponse } from "next/server";
import { createRule } from "@/lib/rules";
import { ruleCreateSchema, zodMessage } from "@/lib/validation";
import { jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: add a new AI-judged rule (e.g. for a topic the insights show no rule covers). */
export async function POST(req: Request) {
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = ruleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  try {
    const res = await createRule(parsed.data);
    return NextResponse.json({ code: res.rule.code, policyVersion: res.policyVersion });
  } catch (err) {
    console.error(err);
    return jsonError("Could not add the rule. Please try again.", 500);
  }
}
