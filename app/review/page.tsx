import Link from "next/link";
import { DbError } from "@/components/db-error";
import { StatusBadge } from "@/components/status-badge";
import { getReviewQueue } from "@/lib/queries";
import { getRole } from "@/lib/role";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let rows: Awaited<ReturnType<typeof getReviewQueue>>;
  const role = await getRole();
  try {
    rows = await getReviewQueue();
  } catch (err) {
    console.error(err);
    return <DbError what="the review queue" />;
  }
  const waiting = rows.filter((r) => r.status === "in_review" || r.status === "escalated");
  const done = rows.filter((r) => r.status === "approved" || r.status === "changes_requested");

  const List = ({ items }: { items: typeof rows }) => (
    <ul className="divide-y rounded-lg border">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/submissions/${s.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted">
            <span className="font-medium">{s.title}</span>
            <span className="text-xs capitalize text-muted-foreground">
              {s.channel} · v{s.currentVersion}
              {s.stats && ` · ${s.stats.total} findings, ${s.stats.disputed} disputed${s.stats.open_high ? `, ${s.stats.open_high} open high/critical` : ""}`}
            </span>
            <span className="ml-auto">
              <StatusBadge status={s.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Submissions waiting for a Manager decision.
          {role !== "manager" && " You are viewing as Creator. Switch to Manager in the header to approve."}
        </p>
      </div>
      {waiting.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nothing waiting. As a Creator, <Link href="/submit" className="underline">submit a draft</Link>, then come back here as Manager.
        </p>
      ) : (
        <List items={waiting} />
      )}
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recently decided</h2>
          <List items={done} />
        </section>
      )}
    </div>
  );
}
