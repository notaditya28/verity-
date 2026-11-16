# Features

## Completed
### M1 — Skeleton
- Next.js + TypeScript (strict) + Tailwind app with shadcn-style UI primitives
- Full Drizzle schema: organizations, policy versions, rules, terms, facts, brand assets, submissions, versions, checks, findings, decisions, append-only audit log
- Seed script and a "Reset demo" button restore the fictional demo org **Lumina Skin**: 17 rules, 9 terminology mappings, 10 facts, palette and fonts
- No login wall. The header has a role switcher (Creator / Manager), the demo org name and a "How it works" popover
- `/brand`: rules grouped by category with code, severity, check type and policy version, the Fact Registry table and palette swatches
- `/audit`: audit-log table

## In progress
- M2 deterministic checks + results UI
