import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/demo/constants";
import { runCheck } from "@/lib/checks/run";
import { displayValue } from "@/lib/drift/match";
import { driftActionSchema, uuidSchema, zodMessage } from "@/lib/validation";
import { audit, jsonError, loadLatest, requireRole } from "@/lib/workflow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function shortDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Manager actions on a drift alert: send the post back for update, or dismiss the alert with a reason. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError("Invalid alert id", 400);
  const denied = await requireRole("manager");
  if (denied) return denied;
  const parsed = driftActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 400);
  const { action, reason } = parsed.data;

  try {
    const db = getDb();
    const [alert] = await db
      .select()
      .from(schema.driftAlerts)
      .where(and(eq(schema.driftAlerts.id, id), eq(schema.driftAlerts.orgId, DEMO_ORG_ID)))
      .limit(1);
    if (!alert) return jsonError("Alert not found", 404);
    if (alert.status !== "open") return jsonError(`This alert is already ${alert.status.replace("_", " ")}.`, 409);

    if (action === "dismiss") {
      await db
        .update(schema.driftAlerts)
        .set({ status: "dismissed", resolutionNote: reason, resolvedAt: new Date() })
        .where(eq(schema.driftAlerts.id, id));
      await audit("manager", "drift.dismissed", "submission", alert.submissionId, { alertId: id, factCode: alert.factCode, reason });
      return NextResponse.json({ status: "dismissed" });
    }

    // Send back for update: reuse the normal "changes requested" flow, then re-check under the current policy.
    const data = await loadLatest(alert.submissionId);
    if (!data) return jsonError("Submission not found", 404);
    const [oldFact] = await db.select().from(schema.facts).where(eq(schema.facts.id, alert.oldFactId)).limit(1);
    const [newFact] = alert.newFactId ? await db.select().from(schema.facts).where(eq(schema.facts.id, alert.newFactId)).limit(1) : [];
    const comment =
      alert.reason === "changed" && oldFact && newFact
        ? `${alert.factCode} changed ${displayValue(oldFact)} → ${displayValue(newFact)} on ${shortDate(newFact.validFrom)}; this post still says ${alert.matchedText}. Please update it.`
        : `${alert.factCode} expired${oldFact?.validUntil ? ` on ${shortDate(oldFact.validUntil)}` : ""}; this post still says ${alert.matchedText}. Please update or remove it.`;

    await db.insert(schema.decisions).values({ submissionId: alert.submissionId, role: "manager", action: "request_changes", comment });
    await db
      .update(schema.submissions)
      .set({ status: "changes_requested", updatedAt: new Date() })
      .where(eq(schema.submissions.id, alert.submissionId));
    await db.update(schema.driftAlerts).set({ status: "sent_back" }).where(eq(schema.driftAlerts.id, id));
    await audit("manager", "drift.sent_back", "submission", alert.submissionId, {
      alertId: id,
      factCode: alert.factCode,
      from: data.submission.status,
      version: data.version.versionNumber,
      comment,
    });
    let checkError: string | null = null;
    try {
      await runCheck(data.version.id); // current policy, so the creator sees the normal finding and fix
    } catch (err) {
      checkError = err instanceof Error ? err.message : String(err);
    }
    return NextResponse.json({ status: "sent_back", submissionId: alert.submissionId, checkError });
  } catch (err) {
    console.error(err);
    return jsonError("Could not update the alert. Please try again.", 500);
  }
}
