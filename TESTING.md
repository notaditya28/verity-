# Testing notes (Round 3)

Gates run before every push: `npm run typecheck && npm run lint && npm test && npm run build`. Measured results are in [EVAL.md](EVAL.md).

## Automated tests (`npm test`, offline, no keys needed)
| Script | Covers |
|---|---|
| `scripts/test-validate-ai.ts` | AI-output validation: zod shape, exact-quote check, citation must be in the retrieved set, confidence < 0.6 downgrade, duplicates, "supported" items dropped |
| `scripts/test-workflow.ts` | Word diff; applying accepted fixes (replace / insert / delete, overlaps resolved in order) |
| `scripts/test-images.ts` | WCAG contrast and CIEDE2000 reference values; palette, measured contrast and alt text on the real sample image; a loose button box still measures as a pass; image-text price contradiction; a compliant on-brand banner gets no findings; contrast accuracy across colour pairs and text sizes |
| `scripts/test-drift.ts` | **Fact Drift**: old-value normalisation (₹ / Rs / Rs. / INR / `/-` / rupees, separators, %, SPF, day ranges), false-match guards, keyword gating, usages recorded for correct and wrong content and image text, seeded posts clean and recording their fact |
| `scripts/test-insights.ts` | **Insights**: pg_trgm example value, normalisation, grouping; on the seeded history T-02 ranks first with 5 disputes (4 sided with creator), one vegan / cruelty-free topic of 3, one dark-spots fact group of 3; pass rate by channel |
| `scripts/test-confidential.ts` | **Confidential + AI log** (AI client and log intercepted): 0 AI calls for confidential content (gateway refuses judge and vision); planted email, phones, Aadhaar, withheld section and sensitive terms absent from the payload; the `ai_calls` row's counts, character count and SHA-256, with no content; whole-word terms; offsets map to the original; errors logged |

## Evaluation (`npm run eval -- --ai --drift --insights`)
Latest run (EVAL.md): rule engine 25/25 cases (precision and recall 100%, 0 of 7 compliant cases flagged); image 4/4 planted issues, contrast verdict 4/4; Gemini 3/3 AI-only issues, 0 of 4 calls failed, median 2.3 s; drift precision 5/5, recall 5/5, idempotent, auto-resolution correct; confidential 7/7 check groups; insights planted rule first, uncovered topic found, trigram similarity identical to Postgres on 10 pairs.

## End-to-end runs (real database + real Gemini)
Scripted HTTP runs against a local production build (`next start`) and against the deployed URL, then the demo was reset:
- **Drift** (deployed URL): reset → F-12 to ₹499 → post on `/drift` 0.9 s later, badge "Drift · 1" → send back → C-03 fix ₹449 → ₹499 → accept all → apply → submit → approve → alert resolved. Creator calling send-back → 403.
- **Drift** (local): validity-only edit of F-32 into the past → one *expired* alert, no duplicates after more page loads; dismiss without reason → 400, with reason → dismissed; usages deleted + F-31 change → found by the text scan.
- **Confidential + AI log** (local): confidential submission → only a "kept local" row; withheld draft → judge row with 1 phone masked, 1 section withheld; image → vision + judge rows; sensitive-term add (creator 403, duplicate 409) and remove; mark-confidential one-way (creator 403); audit log contains no confidential text, terms or phone numbers.
- **Insights** (local): ranking T-02 → vegan / cruelty-free → dark spots; clarify (creator 403); accept → T-02 v2, next check on policy v2; new AI rule C-05; fact without value rejected, with value → F-42.

## Manual test matrix
| Check | Result |
|---|---|
| Chromium (Claude desktop app browser), desktop width — `/drift` with an open alert, the drift banner on a submission | ✅ renders as designed (visual check; browser console not inspected) |
| Headless Chrome (Round 2 pages) — home, submit, results, image results, diff, brand | ✅ renders (screenshots in the Round 2 PDF) |
| Mobile width 375 px — `/`, `/drift`, `/insights`, `/ai-log` | ✅ no horizontal page scroll; header nav scrolls sideways |
| Without cookies (as a first-time / incognito visitor) — every page returns 200, defaults to Creator | ✅ |
| Both roles — every Manager-only API returns 403 to a Creator (decision, drift actions, fact edit, rules, sensitive terms, mark confidential, clarification) | ✅ |
| Reset demo after checks, drift alerts, rule versions and new facts | ✅ restores all seed data (≈0.5–1.3 s on Vercel) |
| Page speed on Vercel — `/drift`, `/insights`, `/ai-log`, `/brand`, `/submissions` | ✅ 0.5–0.8 s; `/review` 1.2 s; home 1.6 s (cold start) |
| Microsoft Edge, Safari, a physical phone | ⚠️ not tested by hand (Edge is Chromium; layout uses standard CSS only) |

## Bugs found and fixed during Round 3
1. **Correct content left no trace** for drift (findings only on mismatches) → `fact_usages` recorded for every fact match, including AI-supported claims.
2. **Validity-only fact edits raised misleading "changed" alerts**, and expiry missed content checked against an earlier row with the same value → changed-drift only when the value changes; matching across same-value rows.
3. **AI-log counts would have been zero** because content was masked before the gateway → the gateway masks the whole prompt in one pass, so counts are real.
4. **Rule-finding quotes could leak withheld text into the prompt** (`<already_found>`) → quotes inside withheld sections are masked, and the gateway's sanitiser is applied to the whole prompt.
5. **Confidential titles were written to the audit log** → confidential submissions log flags only.
6. **Reset demo could exceed the default function time limit** with the larger seed → 60 s limit on the reset route (≈1 s on Vercel).
7. A demo sample put a wholesale price inside a withheld section, which the rule engine read as the retail price → sample rewritten.
8. **"Treats acne in a week" missed C-02** (Round 2 eval miss) → fixed-time pattern accepts number words and weeks / months.
9. **A corrected, on-brand image still got palette and contrast findings** (found while testing "Upload corrected image") → dominant colours are now measured by true pixel share (node-vibrant ignored light backgrounds), and text crops are downscaled by area with nearest-neighbour sampling. Regression tests: a compliant ivory banner gets no findings; measured contrast within ±0.1 (or 2%) of the true value with the same verdict.

## Known issues
- Clarifying a rule's wording doesn't change a pattern rule's parameters (T-02 still flags "!!" after clarification).
- Free-tier Gemini can return 429/503 under load; a backup model is tried, otherwise "Retry AI checks".
- Expiry drift is computed on page load, not by a background job.
- The demo is shared: everyone sees the same data, and **Reset demo** clears it for everyone.
- Video (reels, shorts, video ads) is not supported yet: only the caption (as text) and a cover image can be checked. Planned next: timestamped speech and on-screen text via Gemini video understanding, with the existing checks run on it.
