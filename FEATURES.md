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

### M5 — Images
- Upload a PNG, JPEG or WebP (up to 1.5 MB) with alt text. Sample 4 ("Ad image (off-palette)") loads a generated festive banner
- **Gemini vision** reads the image once per version (`lib/prompts/vision.ts`, `vision-v1`, 20 s timeout, one quick retry on 429/503, zod-validated): all visible text, a short description, and up to 6 text blocks with boxes. The result is saved on the version, so re-checks don't call it again
- **Text in the image goes through the same rule checks** as the body (price vs Fact Registry, superlatives, guarantees, terminology…). Image findings have no text span, so their fix is advice such as “In the image, change ₹399 to ₹449”. The AI judge also sees the image text
- **A-02 contrast (WCAG 2.1, 4.5:1):** each text block is cropped with `sharp`, and its pixels are split into text and background colours with two-colour k-means. The ratio is computed in code, and the fix suggests the palette colour with the best contrast on that background. If the crop can't be measured, the model's colour estimate is used and the finding says so
- **V-01 palette:** dominant colours come from `node-vibrant`. Any colour covering ≥ 8% of the image with CIEDE2000 ΔE > 12 from every palette colour is flagged, along with the nearest palette colour
- **A-01 alt text:** missing, too short or generic alt text (e.g. “banner.png”) is flagged. The fix proposes alt text from the image description. Accepting it and clicking “Apply accepted fixes” sets the new version's alt text
- The results page shows what Verity read from the image: alt text, extracted text, description and dominant colours with swatches. Finding cards show colour swatches next to hex codes
- Failure modes: if image reading fails, palette and alt-text checks still run, and the page offers “Retry AI checks” (which re-reads the image). With no API key, the page says the image text wasn't read
- `scripts/test-images.ts` runs the pixel pipeline offline on the real sample image. The yellow text measures 1.6–1.7:1 (fail), white on teal 4.8:1 (pass), and the orange is off-palette

### M6 — Evaluation and docs
- `npm run eval` (`scripts/eval.ts`) writes [EVAL.md](EVAL.md) with measured numbers only:
  - rule-engine precision and recall on 25 hand-labelled cases (`scripts/eval-cases.ts`), with misses listed as they are
  - fix effectiveness on the samples
  - contrast measured from the image vs the true drawing colours
  - `--ai` adds Gemini judge cases (tone, goal fit, unsupported claims, clean control), validation stats, latency and vision OCR on sample 4
- `npm test` runs the offline unit checks
- README with a 60-second walkthrough, a Mermaid flow diagram, architecture, setup, env vars and limitations
- ROUND3.md: how Fact Drift Alerts, guideline-gap insights and confidential mode build on the current schema
- DISCLOSURES and CHANGES_FROM_PLAN are final

## Not built (by design)
- Logo detection (last item on the cut list)
- Real authentication and multi-org support (the brief asks for a pre-seeded demo org and a role switcher)
- Replacing the image inside an existing submission (image findings are advice; see CHANGES_FROM_PLAN)
