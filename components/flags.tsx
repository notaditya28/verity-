import { History, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Lock badge: this submission is never sent to a third-party AI. */
export function ConfidentialBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="outline" className={`gap-1 border-slate-400 text-slate-800 ${className}`} title="Confidential: checked locally, never sent to a third-party AI">
      <Lock className="h-3 w-3" aria-hidden />
      Confidential
    </Badge>
  );
}

export function DemoHistoryBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground" title="Seeded demo history. All of it is fictional.">
      <History className="h-3 w-3" aria-hidden />
      Demo history (fictional)
    </Badge>
  );
}

/** Both flags for a submission row. */
export function SubmissionFlags({ confidential, demoHistory }: { confidential: boolean; demoHistory: boolean }) {
  if (!confidential && !demoHistory) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {confidential && <ConfidentialBadge />}
      {demoHistory && <DemoHistoryBadge />}
    </span>
  );
}
