import Link from "next/link";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbError } from "@/components/db-error";
import { ConfidentialBadge } from "@/components/flags";
import { AI_PROVIDER } from "@/lib/ai/gateway";
import { AI_PURPOSES, AI_STATUSES, aiTotals, listAiCalls, type AiLogFilters } from "@/lib/ai/queries";

export const dynamic = "force-dynamic";

const PURPOSE: Record<string, string> = { judge: "Claim & tone judging", vision: "Reading an image", clarification: "Rule clarification" };
const STATUS: Record<string, { label: string; variant: "success" | "high" | "medium" | "muted" }> = {
  ok: { label: "Sent", variant: "success" },
  error: { label: "Error", variant: "high" },
  timeout: { label: "Timed out", variant: "medium" },
  skipped_confidential: { label: "Kept local", variant: "muted" },
};

export default async function AiLogPage({ searchParams }: { searchParams: Promise<{ purpose?: string; status?: string }> }) {
  const sp = await searchParams;
  const f: AiLogFilters = {
    purpose: (AI_PURPOSES as readonly string[]).includes(sp.purpose ?? "") ? (sp.purpose as AiLogFilters["purpose"]) : undefined,
    status: (AI_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as AiLogFilters["status"]) : undefined,
  };
  let rows: Awaited<ReturnType<typeof listAiCalls>>;
  let totals: Awaited<ReturnType<typeof aiTotals>>;
  try {
    [rows, totals] = await Promise.all([listAiCalls(f), aiTotals(f)]);
  } catch (err) {
    console.error(err);
    return <DbError what="the AI-use log" />;
  }

  const kpis = [
    { n: totals.calls, label: "AI calls made", sub: `${totals.ok} sent · ${totals.failed} failed or timed out` },
    { n: totals.chars.toLocaleString("en-IN"), label: "characters sent", sub: `${totals.images} image${totals.images === 1 ? "" : "s"} sent` },
    { n: totals.personal + totals.sensitive + totals.withheld, label: "items masked before sending", sub: `${totals.personal} personal data · ${totals.sensitive} sensitive terms · ${totals.withheld} withheld sections` },
    { n: totals.keptLocal, label: "confidential checks kept local", sub: "nothing sent to any AI provider" },
  ];

  const link = (key: "purpose" | "status", value: string | undefined, text: string) => {
    const next = new URLSearchParams();
    const merged = { purpose: f.purpose, status: f.status, [key]: value };
    if (merged.purpose) next.set("purpose", merged.purpose);
    if (merged.status) next.set("status", merged.status);
    const active = f[key] === value;
    return (
      <Link
        key={`${key}-${value ?? "all"}`}
        href={`/ai-log${next.toString() ? `?${next}` : ""}`}
        aria-current={active ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
      >
        {text}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">AI-use log</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every call Verity makes to a third-party AI ({AI_PROVIDER}) goes through one gateway that masks personal data, withheld sections and
          sensitive terms first, and writes a row here. Only counts and a SHA-256 fingerprint of the payload are stored, never the content.
          Confidential submissions never reach the gateway.
        </p>
      </div>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{k.n}</div>
            <div className="text-sm font-medium">{k.label}</div>
            <div className="text-xs text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </section>

      <nav aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purpose</span>
        {link("purpose", undefined, "All")}
        {AI_PURPOSES.map((p) => link("purpose", p, PURPOSE[p]))}
        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
        {link("status", undefined, "All")}
        {AI_STATUSES.map((st) => link("status", st, STATUS[st].label))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No AI calls match. Run a check from <Link href="/submit" className="font-medium text-primary hover:underline">Submit</Link> and it will appear
          here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Submission</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2">Provider / model</th>
                <th className="px-3 py-2 text-right">Chars</th>
                <th className="px-3 py-2">Masked</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payload SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ call: c, title, confidential }) => {
                const personal = c.redactionCounts.reduce((n, r) => n + r.count, 0);
                return (
                  <tr key={c.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {c.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      {c.submissionId ? (
                        <Link href={`/submissions/${c.submissionId}`} className="hover:underline">{title ?? "Submission"}</Link>
                      ) : (
                        <span className="text-muted-foreground">Brand rules</span>
                      )}
                      {confidential && <ConfidentialBadge className="ml-1" />}
                    </td>
                    <td className="px-3 py-2">{PURPOSE[c.purpose]}{c.imageSent && <span className="block text-xs text-muted-foreground">image sent</span>}</td>
                    <td className="px-3 py-2">
                      {c.status === "skipped_confidential" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> none</span>
                      ) : (
                        <>{c.provider}<span className="block font-mono text-xs text-muted-foreground">{c.model}</span></>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.charsSent.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-xs">
                      {personal + c.sensitiveTermsMasked + c.withheldSections === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {c.redactionCounts.map((r) => <span key={r.type} className="block">{r.count} {r.type}</span>)}
                          {c.sensitiveTermsMasked > 0 && <span className="block">{c.sensitiveTermsMasked} sensitive</span>}
                          {c.withheldSections > 0 && <span className="block">{c.withheldSections} withheld</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                      {c.latencyMs !== null && <span className="block text-xs text-muted-foreground">{c.latencyMs} ms</span>}
                      {c.error && <span className="block max-w-56 text-xs text-red-800">{c.error}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={c.payloadSha256 ?? ""}>
                      {c.payloadSha256 ? `${c.payloadSha256.slice(0, 12)}…` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
