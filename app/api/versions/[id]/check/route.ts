import { NextResponse } from "next/server";
import { runCheck } from "@/lib/checks/run";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid version id" }, { status: 400 });
  try {
    const result = await runCheck(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("re-run check failed", err);
    return NextResponse.json({ error: "The check could not run. Please try again." }, { status: 500 });
  }
}
