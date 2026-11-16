# Round 3 plan

These features are **not built** in Round 2. The Round 2 schema and pipeline were shaped so each can be added without a migration of existing data.

## 1. Fact Drift Alerts
**What:** when a Manager changes a fact (e.g. F-12 serum price ₹449 → ₹499), Verity lists every approved or in-review submission that quotes the old value, and flags it for re-check.

**What's already in place:**
- Facts are versioned. An edit inserts a new row and a new `policy_versions` row, and keeps the old row with `current = false` (`app/api/facts/[code]/route.ts`).
- Every finding stores `fact_code`, and every check stores `policy_version_id`. So "which checks relied on F-12 under the old version" is a join, not a guess.
- The edit is already audited (`fact.updated`, with old and new values).

**To build:** a query from old fact rows to checks on older policy versions to their submissions. Then a "Drift" panel on `/brand` and `/review`, and a one-click re-check that runs the existing `runCheck` against the current policy.

## 2. Guideline-gap insights
**What:** show where the guidelines are unclear or missing, using reviewer behaviour as the signal:
- rules that creators dispute most (and whether managers side with them)
- AI findings downgraded to `needs_human_verification` because no rule or fact could be cited (these are topics the policy doesn't cover)
- the claims most often flagged as `unsupported` (candidates for new facts)

**What's already in place:** `findings.creator_decision` and `dispute_reason`; `decisions` (manager outcome per submission); `findings.label` and `confidence`; and validation stats per check in `audit_log.details.ai.validation` (dropped quotes, citation downgrades, low-confidence downgrades).

**To build:** aggregate SQL views and an `/insights` page with a short "suggested rule" draft per gap, written by Gemini and clearly marked as a suggestion for a manager to accept.

## 3. Confidential mode
**What:** a per-submission switch for unreleased launches. Content never leaves the server for a third-party AI. Only the deterministic rule and image checks run, and the content is redacted in the audit log.

**What's already in place:**
- The AI stage is already optional. When it's skipped, the check completes with rule findings only, and the UI says so (`checks.ai_status = skipped`).
- Personal data is redacted before any AI call (`lib/checks/redact.ts`), and redaction counts are stored on `checks.redactions`.
- The image pipeline separates offline pixel analysis (`lib/images/pixels.ts`) from the AI vision call.

**To build:** a `confidential` boolean on `submissions`, a check in `runCheck` to skip the vision and judge calls, and a lock badge in the UI. An option for a self-hosted model could plug in behind the same `generateJson` function.
