# Changes from the Round 1 plan

| Round 1 plan | Round 2 build | Why |
|---|---|---|
| FastAPI backend + separate frontend | One Next.js (App Router) app with API routes, on Vercel | One deploy and one language. Faster to build and more reliable for judges. |
| Redis + RQ job queue | Checks run inside API routes with timeouts. The UI shows progress. | Fewer moving parts. The data is small enough that a full check fits under 30 s. |
| Tesseract + OpenCV | Gemini vision for OCR. `sharp` + `node-vibrant` for colours. | No native binaries on serverless. Better OCR on stylised ad text. |
| Self-hosted embeddings + vector DB | Postgres full-text search + `pg_trgm` (pgvector seam kept) | The rule and fact set is tiny. Lexical search is enough and needs no model hosting. |

## Decisions on ambiguous points
- **Roles without login:** the role is stored in a `verity_role` cookie set by the header switcher. This is intentional for the judged demo and is not real auth.
- **Fact versioning:** an edit inserts a new fact row and a new `policy_versions` row. The old row is kept with `current = false`. This keeps history for audit and for Round 3 Fact Drift Alerts.
- **Images:** stored as data URLs in `submission_versions.image_url` (capped in the API) rather than in object storage. This avoids another service.
- **Demo org:** fixed UUID (`lib/demo/constants.ts`). "Reset demo" wipes and re-seeds only that org.
- **Extra columns beyond the brief:** `facts.current`, `submission_versions.alt_text` / `visual_description`, `checks.ai_status` / `redactions`, `findings.edited_fix`. Each is needed for a feature in the brief (versioned facts, A-01 alt text, image description, AI retry, redaction log, the "Edit" decision).
- **Extra rules:** `T-01` (voice, AI), `T-03` (no fairness/whitening language, a common Indian beauty-ad issue), `M-02` (goal/audience/CTA fit, AI) and `A-03` (readability hint).
- **Fix format:** `suggested_fix` is machine-applicable. With a span it replaces the quote (empty means delete). With `span_start = span_end` it is inserted at that point. With no span it is advice only. This is what lets "Apply accepted fixes" build the next version without another LLM call.
- **Numbers beyond prices:** C-03 also checks vitamin C % and SPF against the registry, as the brief says "prices and numbers".
- **Unmatched prices:** a ₹ amount that matches no fact becomes `needs_human_verification`, not a hard flag (no source, no hard flag).
- **Which sentences get retrieval:** every sentence (up to 12), not only ones a classifier marks as claims. The content is short, so this is simpler and doesn't miss claims.
- **AI citation format:** the JSON schema uses `""` for "no code" instead of `null`. Plain strings are the most portable structured-output type across Gemini models.
- **AI retry:** "Retry AI checks" re-runs the whole check as a new check row (rule checks are fast and deterministic). That keeps every attempt in the history.
- **AI "supported" findings** are dropped rather than shown, to keep the findings list to actionable issues.
- **Manager detail view** reuses `/submissions/[id]` with a manager panel instead of a separate `/review/[id]` page. `/review` is the queue. It's one page to maintain, and both roles see the same evidence.
- **Submit gate:** high and critical findings must be decided (accepted and applied, or disputed) before submitting. Low and medium findings can go to the reviewer undecided.
- **Escalation flow:** "Escalate to Legal" sets status `escalated`. The same manager panel then offers Approve or Request changes as the Legal decision. There is no separate Legal role in the MVP.
- **Fact edits** are Manager-only. They set `valid_from` to today on the new row.
- **Image text findings are advice-only:** the app can't edit pixels, so findings from text in the image carry an “In the image, change … to …” fix. A creator handles them by uploading a corrected design in a new submission, or by disputing them. Replacing the image inside an existing submission is not built.
- **Contrast measurement:** Gemini only locates the text (boxes). The colours and ratio are measured from the pixels in code, so the number shown is not an LLM guess. The model's colour estimate is used only when a box can't be measured, and the finding says “estimated”.
- **Body-only rules:** ASCI-01 (disclosure) and A-03 (readability) run on the body text only, not on text in the image.
- **Alt-text fix:** accepting the A-01 fix sets the next version's alt text. This is the one non-text fix the app applies.
- **Time budget:** image reading (10 s) plus the judge call (18 s when the image was read in the same check) keep a full check under 30 s.
- **Logo check:** not built (it was last on the cut list). `brand_assets.logo_url` stays in the schema.
- **ASCI-01 scope:** every `instagram` submission is treated as a potential paid or gifted influencer post and must carry a disclosure.
