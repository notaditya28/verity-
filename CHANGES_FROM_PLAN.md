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
- **ASCI-01 scope:** every `instagram` submission is treated as a potential paid or gifted influencer post and must carry a disclosure.
