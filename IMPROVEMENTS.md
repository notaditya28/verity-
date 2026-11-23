# Round 3 — the three improvements

Live: https://verity-eight-lemon.vercel.app · Code: https://github.com/notaditya28/verity- · Measured results: [EVAL.md](EVAL.md) · Tests: [TESTING.md](TESTING.md)

All three were named at Round 2 and are built, deployed and tested. Every number on every page is computed from database rows. The seeded history is fictional and labelled "Demo history (fictional)"; **Reset demo** restores it.

---

## 1. Fact Drift Alerts

**Promised (Round 2):** when a fact changes (e.g. F-12 ₹449 → ₹499), list every approved or in-review item that used the old value, with old vs new, and re-check them in one click. *Done when: a price change lists all affected items within 10 s.*

**Built**
- **The data gap, fixed first.** Findings only exist for mismatches, so a post that correctly said ₹449 left no trace. Every check now records **fact usages** (`fact_usages`): each time content relies on a fact — correct or not — with the exact fact row (version) and matched text. Recorded by the rule engine (prices, thresholds, %, SPF, delivery days, best-seller, "dermatologically tested" / "clinically proven"), by image-text checks, and by the AI judge for claims it marks *supported* with a valid citation and exact quote (those are recorded before being dropped from the findings list).
- **Detection on fact edit**, in the same request: approved, in-review and escalated submissions whose **current version** used the old fact row (or any row with the same value) and states the old value. A **fallback scan** finds content checked before usages existed, with value normalisation (`₹449`, `Rs 449`, `Rs. 449`, `INR 449`, `449/-`, `449 rupees`, thousands separators; `10%` / `10 percent`; `SPF50`; `3–5` / `3-5` / `3 to 5` days), tied to the fact by a keyword nearby so ₹499 for shipping isn't confused with a ₹499 price. Alerts are idempotent (unique on old fact row + submission). One `drift.detected` audit entry with counts.
- **Expiry**: a current fact past its valid-until date opens `expired` alerts, computed when `/drift` or the header badge loads (no cron).
- **Actions (Manager)**: **Send back for update** — sets *changes requested*, adds a manager decision with the comment "F-12 changed ₹449 → ₹499 on 22 Nov; this post still says ₹449", re-checks the current version under the current policy, so the creator gets the normal `C-03` finding with the ₹499 fix and uses the existing apply → submit → approve flow. **Dismiss** requires a reason. Both audited.
- **Auto-resolution**: when a sent-back (or open) submission is re-approved and its latest check no longer uses the old value, the alert becomes **resolved**.
- **UI**: header badge **Drift · N** (both roles); `/drift` grouped by fact with old → new value, reason, matched text in context, detection method, status filters; banner on the submission page; on `/brand`, "N submissions affected → View drift" after an edit, per-fact history, and a **Try it: change F-12 to ₹499** helper that makes a real edit.
- **Seed**: 4 approved posts with full history quoting ₹449 (F-12), free shipping above ₹499 (F-31), 3–5 day delivery (F-30) and a 15% festive discount (F-32, valid until 23 Nov 2026 — it expires during the final round).

**Try it (≈1 min):** switch to **Manager** → **Brand** → **Change F-12 to ₹499** → "1 approved or in-review submission still uses ₹449" → **View drift** → **Send back for update** → (as Creator) **Accept all fixes → Apply → Submit** → (as Manager) **Approve** → **Drift → Resolved**.

**Tests and results**
- `scripts/test-drift.ts` (in `npm test`): value normalisation in all listed forms, false-match guards (₹4499, ₹1449, other prices, 100%, SPF 30, 2–4 days), keyword gating, usage recording for correct and wrong content, image text, and that each seeded post is clean and records its fact.
- `npm run eval -- --drift` (database, same `updateFact` path as the app): 6 scenarios including a negative control, expiry and the fallback scan — **precision 5/5, recall 5/5**; detection ≈1.0–1.4 s per change from a laptop to the database (23–36 ms measured on the deployed app); re-running detection creates 0 duplicates; auto-resolution resolves 0 for a version still saying ₹449 and 1 for a version saying ₹499.
- Live, on the deployed URL: F-12 → ₹499 showed the affected post on `/drift` 0.9 s after the edit; send back → C-03 fix → apply → submit → approve → resolved.

**Known limits:** expiry is detected when `/drift` or any page header loads (no background job). Matching for non-numeric facts (e.g. "approved" claims) relies on recorded usages, not the text scan. The alert compares the current version only.

---

## 2. Guideline-gap insights

**Promised (Round 2):** rank rules by disputes and manager overrides, show the examples behind each, and surface topics the AI could not cite any rule for; draft clearer wording for the owner. *Done when: a planted ambiguous rule tops the dashboard.*

**Built**
- **Four signals, all SQL over real rows** (`lib/insights/queries.ts`), from the latest check of each version, deduplicated per submission + rule + normalised quote:
  1. **Most-disputed rules** — findings, disputes, dispute rate, and how the manager resolved them (approved with the dispute standing = sided with the creator; changes requested = sided with the rule). High dispute rate + managers siding with creators = "rule may be unclear or too strict".
  2. **Uncovered topics** — AI findings with no valid rule or fact (downgraded to *needs human verification*), grouped by topic words; plus the uncited-item totals from each check's validation stats in the audit log.
  3. **Missing facts** — claims most often labelled *unsupported*, normalised (lowercase, prices / numbers / punctuation stripped) and grouped by trigram similarity > 0.5 (our implementation follows `pg_trgm` and matches Postgres `similarity()` exactly in the eval).
  4. **Repeated mistakes** — rules triggered most on first checks and first-check pass rate, by channel.
- **`/insights`**: KPI strip (submissions checked, first-check pass rate, open disputes, uncovered topics), ranked gaps each with its sentence-and-numbers explanation and evidence (quotes, dispute reasons, manager outcomes, links), and the channel table.
- **Draft a clarification (Manager)** — Gemini through the AI gateway, sending only the rule text and anonymised quotes / dispute reasons from non-confidential submissions (masked, logged in the AI-use log). Returns a revised rule description, a new rule, or a new fact, clearly marked **"AI suggestion — review before accepting"**, editable before saving. "Edit by hand" works without AI.
- **Accept → new rule version**: rules are now versioned (`rules.current`): a new rule row and a new policy version; the old row is kept; `rule.updated` audited with old/new. Checks and retrieval use current rules only, so the **next check runs on the new policy version** (shown on the check). New rules for uncovered topics are added as AI-judged rules; "Add as fact" opens a pre-filled fact form where the owner must enter the value and source.
- On `/brand`: rule history and inline hints ("Disputed in 5 of 5 findings — view insight").
- **Seed**: 15 fictional historical submissions with real rule findings, scripted AI findings, creator decisions, disputes and manager outcomes. Planted: T-02 disputed on festival greetings ("Happy Diwali!!") with managers approving anyway; vegan / cruelty-free claims no rule or fact covers; a repeated "reduces dark spots by 30%" claim.

**Try it (≈1 min):** **Insights** → #1 is *T-02 — No slang or all-caps hype: rule may be unclear or too strict* (disputed in 5 of 5, managers sided with the creator in 4 of 5) → open evidence → (Manager) **Draft a clarification** → review → **Accept → new rule version** → submit any post: its check runs on the new policy version.

**Tests and results**
- `scripts/test-insights.ts` (in `npm test`): `pg_trgm` example value (`similarity('word','two words') = 0.363636`), normalisation, grouping, and that on the seeded history T-02 ranks first (5 disputes, 4 sided with creator, 1 with rule), the vegan / cruelty-free topic forms one group of 3, and the dark-spots claim groups 3 findings.
- `npm run eval -- --insights` (database): planted rule ranked first ✅, uncovered topic found ✅, trigram similarity vs Postgres `similarity()` on 10 quote pairs — largest difference 0.000000.
- Live end-to-end (local server + real database + Gemini): clarification drafted in 3.5 s, accepted → T-02 policy v2, next check ran on v2; uncovered topic → new AI rule C-05; missing fact → F-42 only after value, owner and source were entered.

**Known limits:** a clarified rule's *wording* is what reviewers and the AI judge see; for pattern-based rules (like T-02's "!!") it doesn't rewrite the pattern parameters, so the deterministic check still fires until the pattern is changed. Manager "sided with" is inferred per submission (the latest manager decision), not per finding. Topic grouping for uncovered claims is by shared topic words.

---

## 3. Confidential mode with AI disclosure

**Promised (Round 2):** a per-submission switch that keeps content away from external AI (rule and pixel checks only), plus a log of exactly what was sent to which provider and model. *Done when: planted personal data never reaches the LLM, and the log proves it.*

**Built**
- **One AI gateway** (`lib/ai/gateway.ts`) is the only code that calls Gemini (judge, vision, clarification). It **throws** if called with confidential content, **sanitises the entire prompt** — content, brief fields and quotes of rule findings — and writes one **`ai_calls`** row per call: purpose, provider, model, prompt version, characters sent, image sent, personal-data counts, withheld sections, sensitive terms masked, payload SHA-256, status (ok / error / timeout / kept local), latency. **The raw payload is never stored.**
- **Confidential submissions** (toggle on `/submit`; a manager can switch it on later, never off, audited): vision and judge calls are skipped entirely. Rule, alt-text and palette checks run locally, plus an **offline contrast estimate** from dominant colour pairs, labelled *estimated*. The page says what was skipped and why. One `ai_calls` row records "kept local". No title or content of a confidential submission is written to the audit or AI log.
- **Withheld sections** for normal submissions: `[[confidential]] … [[/confidential]]`. Rule checks see the full text (offsets map to the original); the AI payload gets `[WITHHELD]`, and rule-finding quotes from inside a withheld section are masked before the prompt is built.
- **Sensitive terms** on `/brand` (Manager-editable, audited without storing the term): e.g. "Project Aurora", "GlowMart" → `[SENSITIVE]`, case-insensitive, whole words, in addition to personal-data redaction (emails, Indian phone numbers +91 / 10-digit, Aadhaar- and PAN-like IDs).
- **`/ai-log`**: organisation-wide table with purpose / status filters and totals computed from rows (calls, characters sent, items masked, confidential checks kept local). **AI disclosure** panel on each submission, e.g. "Sent 6,894 characters (1 phone number masked; 1 section withheld) to Google Gemini gemini-3.5-flash-lite for claim and tone judging. No image was sent." — or "Checked locally. Nothing was sent to any AI provider."
- Lock badge on the submissions list, results, review and drift pages.
- **Seed**: the confidential draft "Project Aurora launch teaser" (checked locally), a normal "Partner newsletter draft" with a withheld section and a phone number (unchecked, so a judge's first "Run check again" makes a real, logged call), and two sensitive terms. Two matching samples on `/submit`.

**Try it (≈1 min):** **AI log** → "1 confidential check kept local". Open **Partner newsletter draft** → **Run check again** → the AI disclosure panel shows what was sent and masked. **Submit** → sample **Unreleased launch (confidential)** → results say "Checked locally" and the AI log gains a "Kept local" row, no call.

**Tests and results**
- `scripts/test-confidential.ts` (in `npm test`) intercepts the AI client and the log (dependency injection in the gateway) and runs the real judge stage: **(a)** a confidential submission makes **0** AI calls (judge skipped; gateway refuses judge and vision); **(b)** a document with a planted email, phone, Aadhaar-like ID, a withheld section and two sensitive terms reaches the payload with **none** of them present, and the `ai_calls` row records 1 email + 1 phone + 1 ID, 1 withheld section, 3 sensitive terms, the exact characters sent and a SHA-256, with no content. Also redaction patterns, whole-word sensitive terms, offsets, and error logging. 7/7 groups pass (also in EVAL.md).
- Live end-to-end (local server + real database + Gemini): confidential submission → only a "kept local" row; withheld draft → 6,894 chars, 1 phone masked, 1 section withheld; image → vision row (image sent) + judge row; audit log contains no confidential text, terms or phone numbers.

**Known limits:** an image that is sent to vision can't be masked (the log records "image sent"; use Confidential for unreleased visuals). Marking a submission confidential after it was checked doesn't recall earlier calls (they stay visible in the AI log). Redaction is pattern-based (names and addresses are not detected).

---

## Also in Round 3 (Round 2 fixes)
- **Eval miss fixed:** "Treats acne in a week." now also triggers C-02 (fixed-time results in words: *a / two / a few … days / weeks / months*), without flagging delivery times. Rule engine: 25/25 cases, precision and recall 100%.
- **Replace the image** in a submission: "Upload corrected image → vN" creates the next version and re-checks it. Testing it found false palette / contrast findings on a corrected on-brand banner; colours are now measured by true pixel share and contrast crops more accurately (see TESTING.md, bug 9).
- **Start here** on the home page: three guided paths that switch to the right role.
- **Model**: `gemini-3.5-flash-lite` with a backup model; new pages render in under 2 s on Vercel (indexed queries).
