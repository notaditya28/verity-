import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DbError } from "@/components/db-error";
import { StatusBadge } from "@/components/status-badge";
import { SubmissionFlags } from "@/components/flags";
import { listSubmissions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  let rows: Awaited<ReturnType<typeof listSubmissions>>;
  try {
    rows = await listSubmissions();
  } catch (err) {
    console.error(err);
    return <DbError what="submissions" />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Submissions</h1>
        <Button asChild>
          <Link href="/submit">New submission</Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          No submissions yet. <Link href="/submit" className="underline">Submit a draft or try a sample.</Link>
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/submissions/${s.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted">
                <span className="font-medium">{s.title}</span>
                <span className="text-xs capitalize text-muted-foreground">{s.channel} · v{s.currentVersion}</span>
                <SubmissionFlags confidential={s.confidential} demoHistory={s.demoHistory} />
                <span className="ml-auto"><StatusBadge status={s.status} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
