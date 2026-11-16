import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await seedDemo(getDb());
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("demo reset failed", err);
    return NextResponse.json({ error: "Could not reset the demo. Please try again in a moment." }, { status: 500 });
  }
}
