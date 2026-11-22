import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarX, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbError } from "@/components/db-error";
import { StatusBadge } from "@/components/status-badge";
import { detectExpired } from "@/lib/drift/detect";
import { contextSnippet, displayValue } from "@/lib/drift/match";
import { ALERT_STATUSES, alertCounts, listAlerts, type AlertStatus, type AlertView } from "@/lib/drift/queries";
import { getRole } from "@/lib/role";
import { DriftActions } from "./drift-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<AlertStatus, string> = { open: "Open", sent_back: "Sent back", dismissed: "Dismissed", resolved: "Resolved" };
const STATUS_VARIANT: Record<AlertStatus, "high" | "medium" | "muted" | "success"> = { open: "high", sent_back: "medium", dismissed: "muted", resolved: "success" };

function date(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default async function DriftPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = (ALERT_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as AlertStatus) : raw === "all" ? undefined : "open";
  const isManager = (await getRole()) === "manager";

  let alerts: AlertView[];
  let counts: Awaited<ReturnType<typeof alertCounts>>;
  try {
    await detectExpired(); // idempotent: opens alerts for facts whose valid-until date has passed
    [alerts, counts] = await Promise.all([listAlerts(status), alertCounts()]);
  } catch (err) {
    console.error(err);
    return <DbError what="drift alerts" />;
  }

  // Group by fact code + old fact row (one fact change = one group).
  const groups = new Map<string, AlertView[]>();
  for (const a of alerts) {
    const k = `${a.factCode}|${a.oldFact.id}`;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  const tab = (key: AlertStatus | "all", label: string, n?: number) => {
    const active = (key === "all" && status === undefined) || key === status;
    return (
      <Link
        key={key}
        href={`/drift?status=${key}`}
        aria-current={active ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
      >
        {label}
        {n !== undefined && <span className="ml-1 opacity-80">{n}</span>}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Fact Drift</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          When an approved fact changes or expires, Verity finds approved and in-review content that still uses the old value, using the
          fact usages recorded by every check (plus a text scan for older content). Send a post back to its creator in one click, or dismiss the
          alert with a reason.
        </p>
      </div>

      <nav aria-label="Filter alerts" className="flex flex-wrap gap-2">
        {tab("open", "Open", counts.open)}
        {tab("sent_back", "Sent back", counts.sent_back)}
        {tab("resolved", "Resolved", counts.resolved)}
        {tab("dismissed", "Dismissed", counts.dismissed)}
        {tab("all", "All")}
      </nav>

      {alerts.length === 0 && (
        <div className="rounded-lg border p-6 text-sm">
          <p className="font-medium">No {status ? STATUS_LABEL[status].toLowerCase() : ""} drift alerts.</p>
          <p className="mt-1 text-muted-foreground">
            {isManager ? (
              <>
                Try it: on <Link href="/brand#facts-h" className="font-medium text-primary hover:underline">Brand</Link>, change F-12 (Vitamin C Serum
                price) to ₹499. Approved posts that still say ₹449 will appear here within seconds.
              </>
            ) : (
              <>Switch to <b>Manager</b> in the header, then change a fact on the Brand page to see drift in action.</>
            )}
          </p>
        </div>
      )}

      {[...groups.values()].map((items) => {
        const a0 = items[0];
        return (
          <section key={`${a0.factCode}-${a0.oldFact.id}`} aria-label={`Drift for ${a0.factCode}`} className="space-y-3 rounded-lg border p-4">
            <header className="flex flex-wrap items-center gap-2">
              {a0.reason === "changed" ? <AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden /> : <CalendarX className="h-4 w-4 text-orange-600" aria-hidden />}
              <span className="font-mono font-semibold">{a0.factCode}</span>
              <span className="text-sm text-muted-foreground">{a0.oldFact.subject}, {a0.oldFact.attribute}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <del className="rounded bg-red-50 px-1 text-red-900">{displayValue(a0.oldFact)}</del>
                {a0.reason === "changed" && a0.newFact ? (
                  <>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    <ins className="rounded bg-emerald-100 px-1 text-emerald-900 no-underline">{displayValue(a0.newFact)}</ins>
                    <span className="font-normal text-muted-foreground">changed {date(a0.newFact.validFrom)}</span>
                  </>
                ) : (
                  <span className="font-normal text-muted-foreground">expired {a0.oldFact.validUntil ? date(a0.oldFact.validUntil) : ""}</span>
                )}
              </span>
              <Badge variant="muted" className="ml-auto">{items.length} affected</Badge>
            </header>
            <ul className="space-y-3">
              {items.map((a) => {
                const snip = contextSnippet(a.versionText, a.matchedText) ?? (a.extractedText ? contextSnippet(a.extractedText, a.matchedText) : null);
                return (
                  <li key={a.id} className="space-y-2 rounded-md bg-muted/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/submissions/${a.submission.id}`} className="font-medium hover:underline">{a.submission.title}</Link>
                      <StatusBadge status={a.submission.status as Parameters<typeof StatusBadge>[0]["status"]} />
                      {a.submission.demoHistory && <Badge variant="outline">Demo history (fictional)</Badge>}
                      <Badge variant={STATUS_VARIANT[a.status]} className="ml-auto">{STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <p className="text-sm">
                      {snip ? (
                        <>
                          {snip.before}
                          <mark className="rounded bg-orange-200 px-0.5 text-orange-950">{snip.match}</mark>
                          {snip.after}
                        </>
                      ) : (
                        <>“{a.matchedText}”{a.extractedText ? " (in the image)" : ""}</>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      v{a.versionNumber} ·{" "}
                      {a.detection === "usage" ? "found by the fact usage recorded when this version was checked" : "found by scanning the text for the old value"} ·
                      alert opened {date(a.createdAt)}
                      {a.resolutionNote && <> · {a.resolutionNote}</>}
                    </p>
                    {a.status === "open" &&
                      (isManager ? (
                        <DriftActions alertId={a.id} submissionId={a.submission.id} />
                      ) : (
                        <p className="text-xs text-muted-foreground">Switch to Manager in the header to send this back or dismiss it.</p>
                      ))}
                    {a.status === "resolved" && (
                      <p className="flex items-center gap-1 text-xs text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Updated and re-approved.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
