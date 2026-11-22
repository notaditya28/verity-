import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { describeCall } from "@/lib/ai/queries";
import type { AiCall } from "@/lib/db/schema";
import { MarkConfidentialButton } from "./mark-confidential";

/** "What did this check send to AI?" for one submission: the latest check's calls in plain language. */
export function AiDisclosure({
  calls,
  latestCheckId,
  confidential,
  isManager,
  submissionId,
}: {
  calls: AiCall[];
  latestCheckId: string | null;
  confidential: boolean;
  isManager: boolean;
  submissionId: string;
}) {
  const latest = calls.filter((c) => c.checkId === latestCheckId);
  const earlier = calls.length - latest.length;
  return (
    <section aria-labelledby="ai-disclosure-h" className="space-y-2 rounded-lg border p-3 text-sm">
      <h3 id="ai-disclosure-h" className="flex items-center gap-1.5 font-semibold">
        {confidential ? <Lock className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />}
        AI disclosure
      </h3>
      {confidential && latest.every((c) => c.status === "skipped_confidential") ? (
        <p>Checked locally. Nothing was sent to any AI provider.</p>
      ) : latest.length === 0 ? (
        <p className="text-muted-foreground">{latestCheckId ? "No AI call was made for this check." : "This version hasn't been checked yet."}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {latest.map((c) => (
            <li key={c.id}>{describeCall(c)}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {earlier > 0 && `${earlier} earlier call${earlier === 1 ? "" : "s"} for this submission. `}
        <Link href="/ai-log" className="font-medium text-primary hover:underline">Open the AI-use log</Link>
      </p>
      {isManager && !confidential && <MarkConfidentialButton submissionId={submissionId} />}
    </section>
  );
}
