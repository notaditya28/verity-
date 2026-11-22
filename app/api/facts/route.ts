import { NextResponse } from "next/server";
import { createFact } from "@/lib/rules";
import { factCreateSchema, zodMessage } from "@/lib/validation";
import { jsonError, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/** Manager: add a fact to the Fact Registry (value, owner and source are required). */
export async function POST(req: Request) {
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = factCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  try {
    const res = await createFact(parsed.data);
    return NextResponse.json({ code: res.fact.code, policyVersion: res.policyVersion });
  } catch (err) {
    console.error(err);
    return jsonError("Could not add the fact. Please try again.", 500);
  }
}
