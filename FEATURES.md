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

## In progress
- M3 AI claim and tone checks
