import { DbError } from "@/components/db-error";
import { getAuditLog } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  let rows: Awaited<ReturnType<typeof getAuditLog>>;
  try {
    rows = await getAuditLog();
  } catch (err) {
    console.error(err);
    return <DbError what="the audit log" />;
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Append-only record of every check, decision and policy change.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-3 py-2 capitalize">{r.actorRole}</td>
                  <td className="px-3 py-2 font-mono">{r.action}</td>
                  <td className="px-3 py-2">{r.entity}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground break-all">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
