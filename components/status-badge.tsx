import { Badge } from "@/components/ui/badge";
import type { Submission } from "@/lib/db/schema";

const MAP: Record<Submission["status"], { label: string; variant: "muted" | "medium" | "high" | "critical" | "success" }> = {
  draft: { label: "Draft", variant: "muted" },
  in_review: { label: "In review", variant: "medium" },
  changes_requested: { label: "Changes requested", variant: "high" },
  escalated: { label: "Escalated to Legal", variant: "critical" },
  approved: { label: "Approved", variant: "success" },
};

export function StatusBadge({ status }: { status: Submission["status"] }) {
  const m = MAP[status];
  return <Badge variant={m.variant} className="px-2.5 py-1 text-sm">{m.label}</Badge>;
}
