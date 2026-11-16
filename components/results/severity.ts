import type { Finding } from "@/lib/db/schema";

export const SEV_RANK: Record<Finding["severity"], number> = { low: 1, medium: 2, high: 3, critical: 4 };

export const SEV_HIGHLIGHT: Record<Finding["severity"], string> = {
  low: "bg-sky-100 decoration-sky-600",
  medium: "bg-amber-100 decoration-amber-600",
  high: "bg-orange-200 decoration-orange-700",
  critical: "bg-red-200 decoration-red-700",
};

export const LABEL_TEXT: Record<NonNullable<Finding["label"]>, string> = {
  supported: "Supported",
  contradicted: "Contradicted",
  unsupported: "Unsupported",
  needs_human_verification: "Needs human check",
};

export type OverallStatus = { label: string; tone: "critical" | "medium" | "success"; detail: string };

/** Overall verdict computed from the open (not accepted/disputed) findings. */
export function overallStatus(findings: Pick<Finding, "severity">[]): OverallStatus {
  const max = Math.max(0, ...findings.map((f) => SEV_RANK[f.severity]));
  if (max >= 3) return { label: "Blocked", tone: "critical", detail: "High or critical issues must be fixed or disputed before review." };
  if (max === 2) return { label: "Needs fixes", tone: "medium", detail: "Medium issues found. Fix or dispute them before review." };
  return { label: "Passes checks", tone: "success", detail: findings.length ? "Only low-severity hints remain." : "No issues found." };
}
