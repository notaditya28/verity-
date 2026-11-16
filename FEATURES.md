# Features

## Completed
### M1 — Skeleton
- Next.js + TypeScript (strict) + Tailwind app with shadcn-style UI primitives
- Full Drizzle schema: organizations, policy versions, rules, terms, facts, brand assets, submissions, versions, checks, findings, decisions, append-only audit log
- Seed script and a "Reset demo" button restore the fictional demo org **Lumina Skin**: 17 rules, 9 terminology mappings, 10 facts, palette and fonts
- No login wall. The header has a role switcher (Creator / Manager), the demo org name and a "How it works" popover
- `/brand`: rules grouped by category with code, severity, check type and policy version, the Fact Registry table and palette swatches
- `/audit`: audit-log table

### M2 — Deterministic checks + results UI
- `/submit`: title, channel, goal, audience, CTA, text, image and alt text, five one-click "Try a sample" drafts, and a staged progress indicator
- Rule engine (`lib/checks/deterministic.ts`, no LLM). Every finding cites a rule ID and, where relevant, a fact ID, and comes with a suggested fix:
  - Terminology from the terms table: T-03 fairness language, T-04 "cheap", TERM-01 product-name variants (it merges overlaps so "Lumina VitC serum" becomes one fix)
  - T-02 slang, repeated "!!" and ALL CAPS
  - C-01 superlatives and "#1" claims. Best-seller claims pass only while F-40 is approved and in date
  - C-02 guarantees and fixed-time results, while skipping delivery times
  - C-03 ₹ prices, free-shipping thresholds, vitamin C % and SPF, compared in code with the matching fact. A mismatch is `contradicted`, an expired fact is `needs_human_verification`
  - C-04 "clinically proven" against F-21, suggesting the approved F-20 wording instead
  - ASCI-01 missing disclosure on Instagram. ASCI-02 cure or treat claims, with condition-aware softer wording
  - M-01 delivery promises (next-day, or numbers that don't match F-30)
  - A-03 Flesch readability hint (low severity)
- Personal data (emails, phone numbers, Aadhaar/PAN-like IDs) is redacted from AI input, and the redaction counts are stored on the check and in the audit log
- `/submissions/[id]`: content with highlights coloured by severity, a summary computed from the findings (counts and overall status), finding cards (Rule/AI badge, claim label, severity, confidence, "Breaks …" / "Contradicts F-12: ₹449", quoted evidence, a replace/remove/add diff) and a re-run button when a check failed
- `/submissions` list
- `scripts/try-samples.ts`: offline sanity run of all samples. Applying every fix and re-checking gives 0 findings

### M3 — AI claim and tone checks
- Retrieval (`lib/checks/retrieve.ts`): for each sentence, Postgres full-text search (`ts_rank`) plus `pg_trgm` `word_similarity` over rules and current facts, top 5 each. AI-judged rules (T-01 voice, M-02 goal/audience/CTA fit) are always in scope. The retriever is behind an interface so pgvector can slot in later
- One Gemini call per check (`lib/ai/gemini.ts`): model from `GEMINI_MODEL`, temperature 0, structured JSON output with a schema, 22 s timeout
- The prompt (`lib/prompts/judge.ts`, `PROMPT_VERSION = judge-v1`) has separate delimited blocks for the brief, retrieved rules, retrieved facts, rule findings already caught, and the content. The content block is marked untrusted, and tag-like text inside it is neutralised
- Validation (`lib/checks/validate-ai.ts`), checked by `scripts/test-validate-ai.ts`:
  - zod parse
  - drop findings whose quote isn't an exact substring of the content
  - a cited code that wasn't retrieved is stripped and the finding becomes `needs_human_verification`
  - no citation at all also becomes `needs_human_verification`, capped at medium (no source, no hard flag)
  - confidence below 0.6 becomes `needs_human_verification`
  - "supported" items and duplicates of rule findings are dropped
- Failure mode: if Gemini errors or times out, the rule findings are still saved, the check is marked `partial`, and the results page shows "Retry AI checks". With no API key the AI stage is skipped and the page says so
- Each check row stores `policy_version_id`, `prompt_version` and `model`. The audit log records the provider, model, retrieved codes, validation stats and redaction counts

### M4 — Decisions and workflow
- Creator decisions on every finding: **Accept**, **Edit** (your own replacement) or **Dispute** (reason required), with Undo. "Accept all fixes" handles the quick path
- **Apply accepted fixes → new version**: builds v(n+1) from the accepted or edited fixes (overlaps resolved in order), re-runs the full check, shows a word-level **version diff**, and carries disputes forward to matching findings
- **Submit for review** is blocked while any high or critical finding is undecided, or while accepted fixes haven't been applied. The API gives a friendly reason
- Manager view, through the header role switcher:
  - `/review` lists the queue with finding, dispute and open-high counts
  - the submission page shows the creator's decisions plus **Approve / Request changes / Escalate to Legal**. A comment is required for request changes and escalate
  - escalated items can then be approved or sent back
- "Changes requested" shows the manager's comment to the creator, and the page has a review history
- `/brand` Fact Registry editing (Manager): each edit creates a new policy version and a new fact row. The old row is kept (`current = false`) and new checks use the new value
- Every action is written to the append-only audit log: decisions, accept-all, version created, submitted, approve, request changes, escalate, fact updated
- Roles are enforced on the server for every workflow API
- `scripts/test-workflow.ts` tests the diff and fix application

## In progress
- M5 images
