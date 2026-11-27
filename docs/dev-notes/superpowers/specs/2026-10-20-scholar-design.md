# Scholar: Expanded Design (Free-Tier Build)

> **Date:** 2026-10-20
> **Source:** `ai-learning-platform-brief.md` (the brief). This document expands it; it does not replace it. Feature and screen IDs (A2.5, B-S4, ...) refer to the brief.
> **Constraint added by the owner:** use free, open-source, or free-tier services for now.
> **How this was written:** the owner chose to skip discovery questions. Everything below that is not in the brief is marked **[call]**: a builder's recommendation the owner has not yet approved.

---

## 1. Intent

Scholar helps students write better (Draft Coach) and remember more (Recall) by coaching the process instead of producing the work. The student does the thinking; the AI asks, hints, checks, explains, and schedules.

The free-tier constraint changes the engineering more than the product. Three consequences shape everything below:

1. **Every LLM call is scarce.** Free tiers are rate-limited per minute and per day. The design pushes work to deterministic code, the user's device, and caches, and calls an LLM only where judgment is needed.
2. **Free AI tiers often have weaker privacy terms.** Some free LLM tiers allow the provider to use inputs for training. That conflicts with the brief's privacy rules for minors (E4). See §5.
3. **Free hosting pauses, sleeps, or caps.** The architecture must tolerate cold starts, a paused database, and quota exhaustion without losing student work.

## 2. Goals, non-goals, anti-goals

**Goals (MVP)**
- A student gets useful, prioritized, rubric-aligned essay feedback and revises at least once (F1 north star).
- A student turns notes into a small set of high-quality cards and completes daily reviews with typed answers (F2 north star).
- The whole MVP runs at $0/month for a closed beta of roughly 50–200 users. **[call]** on the size.

**Non-goals (for now)**
- Teacher features (Phase 3), LMS integrations, native apps, public deck library.
- Audio/video/YouTube import, image occlusion, math step grading.
- Payments. The tiers in Part H stay on paper until costs are real.

**Anti-goals: shipping any of these means failure, even if the feature works**
- The AI writes or rewrites a student's essay beyond the capped level-5 hint.
- A card or citation that is not grounded in a real source passage.
- A student loses a draft or review history because a free service paused or hit a quota.
- Minors' writing goes to a provider that may train on it.
- Guilt-driven streak messaging or a review pile that grows without limit.

## 3. Constraints

| Constraint | Source | Effect on design |
|---|---|---|
| Free / open-source / free-tier services only | Owner | §4 stack; §6 LLM budget |
| Mobile-first, low bandwidth | Brief, principle 6 | PWA, offline review, small bundles |
| Accessible by default | Brief, principle 7 | WCAG 2.2 AA; dyslexia font option; TTS; color is never the only signal |
| Many users are minors | Brief, E4 | §5 age gate for the beta |
| No ghostwriting | Brief, D3.4 | Level-5 rewrite cap enforced server-side, not just in UI |
| Treat uploaded content as data | Brief, D3.4 | Prompt-injection handling in every pipeline |

## 4. Stack (all free or open source)

> Free-tier limits change often. Verify every limit below against the provider's current pricing page before relying on it.

| Layer | Choice | Why | Free-tier caveat |
|---|---|---|---|
| Web app | Next.js (React) + Tailwind CSS, as a PWA | The brief suggests it; large ecosystem | — |
| Hosting | Cloudflare Pages / Workers **[call]** | Its free plan allows commercial use | Vercel's Hobby plan is non-commercial only. Use it for prototypes, not a launched product. |
| Database, auth, storage | Supabase free plan | Postgres + Auth + Storage + pgvector + Row Level Security in one place | Small DB and storage quotas. Projects pause after about a week without activity. A free cron ping or the first visitor wakes it, with a slow first request. |
| Background jobs | Supabase Queues (pgmq) + pg_cron | Already in Postgres; no extra service | — |
| Rich text editor | Tiptap (MIT core) | Anchored marks and highlights for A2.7 | Paid Tiptap extensions are not needed |
| Spaced repetition | `ts-fsrs` (MIT) | The FSRS reference implementation for TypeScript | Runs on the client too, which enables offline review |
| Grammar / mechanics | LanguageTool (open source; self-host or free public API) | Deterministic sentence-level checks without spending LLM calls | The public API is rate-limited. Its rules flag some dialect features, so filter them against E3. |
| LLM (judgment tasks) | Provider router over free tiers: Google Gemini API, Groq, OpenRouter free models; Ollama locally for development **[call]** | No single free tier covers the load; the router fails over on 429s | Data-use terms differ by provider and tier. See §5. |
| Embeddings | `transformers.js` running a small sentence model (e.g. all-MiniLM-L6-v2, 384 dims) in the browser or a Worker | Zero API cost; also powers offline grading | Smaller models catch fewer near-duplicates. Tune the similarity threshold on real decks. |
| OCR | Tesseract.js in the browser; a vision LLM only as a fallback for hard images | Free, private, works offline | Weak on handwriting and formulas. B7 already requires a correction step before generation. |
| PDF / DOCX / PPTX parsing | pdf.js, mammoth.js, JSZip + XML for `.pptx` | Client-side, so files never leave the device until the student chooses to | — |
| Text-to-speech | Browser `speechSynthesis` | Free and offline | Voice quality differs by OS |
| Speech-to-text (Phase 2) | Whisper via `transformers.js` (tiny/base) on device; Groq's Whisper as the fallback | — | On-device models are slow on low-end phones |
| Offline storage | IndexedDB via Dexie; a service worker (Serwist) | Due cards and drafts survive offline | — |
| Charts / graphs | Recharts; React Flow (MIT) | Named in the brief | — |
| Math | KaTeX | Named in the brief | — |
| Fonts | Atkinson Hyperlegible, OpenDyslexic (both OFL) | Accessibility (principle 7) | — |
| Analytics | PostHog free tier | Named in the brief | Turn off session replay for minors |
| Error tracking | Sentry free developer plan | — | Strip essay text from error payloads |

**Rule of thumb [call]:** parsing, OCR, embeddings, scheduling, and simple grading run on the device. The server holds data and makes LLM calls. That keeps the server inside free quotas and keeps raw files private by default.

## 5. Privacy and the free-tier problem

The brief requires age-appropriate consent and no training on student content without consent (E4). Free LLM tiers can break that by default: some providers' free terms allow inputs to improve their models.

**Recommendation [call]:**
1. **Closed beta is 18+ only.** That covers personas P2 (college) and P4 (board-exam reviewees), which are already the MVP focus for Recall and half of Draft Coach's. It defers parental consent flows (COPPA, and the Philippines' RA 10173 rules for minors) until there is budget for a paid, no-training LLM tier and a legal review.
2. **Per-provider data flag.** Each provider in the LLM router carries a `trains_on_inputs` flag from its current terms. Production student content routes only to providers with that flag set to false. Development and evaluation use synthetic or consented sample essays.
3. **Disclose it.** Onboarding states in one plain sentence which AI providers process the student's text.
4. **No essay text in logs.** Store analysis results; never put raw drafts in analytics, error tracking, or LLM-provider dashboards you don't control.

P1 (high-school students) stays the long-term target. It moves in once the conditions in item 1 are met.

## 6. LLM budget design

Free tiers allow roughly tens of requests per minute and hundreds to low thousands per day per key. The design treats LLM calls as a budget.

### 6.1 Provider router
- One server-side module wraps all providers behind one function: `complete(task, input, schema)`.
- Each task type (`essay_global`, `essay_paragraphs`, `hint_ladder`, `card_generate`, `card_critique`, `grade_answer`) maps to an ordered provider list. Strong models go to essay global analysis; fast small models handle grading and paraphrases.
- On HTTP 429 or a timeout, try the next provider. If all are exhausted, enqueue the job and tell the student when it will run. Never drop it.
- Validate every response against a JSON schema. On invalid output, retry once, then try the next provider.

### 6.2 Fewer calls per essay
The brief's pipeline (D3.1) runs global, paragraph, and sentence passes plus hint ladders. On free tiers it collapses to:

| Step | Brief | Free-tier version **[call]** |
|---|---|---|
| Global pass | Strong LLM | 1 LLM call: thesis, structure, prompt alignment, rubric scores, strengths, top issues |
| Paragraph pass | LLM per paragraph, parallel | 1 batched LLM call covering all paragraphs; chunk only above about 2,000 words |
| Sentence pass | Cheaper LLM | LanguageTool (no LLM), filtered for dialect fairness (E3) |
| Hint ladders | Levels 1–4 for every item | Levels 1–2 generated with the item. Levels 3–4 generated when the student asks. Level 5 stays lazy and capped. |
| Re-check | Changed paragraphs + fresh global pass | Same, with results cached by paragraph `content_hash` |

That is about **2 calls per essay** on first feedback, plus 1 per extra hint the student requests. The brief's version is closer to 10–20.

### 6.3 Grading cascade (Recall, B2.7)
Each typed answer moves down a ladder and stops at the first confident result:

1. **Normalized exact match** (case, punctuation, articles): score 1.0.
2. **Fuzzy match** (edit distance for typos, e.g. Fuse.js): score from similarity.
3. **On-device embedding similarity** between the answer and each key point: hit or miss per key point.
4. **LLM grader** only when step 3 lands in an uncertain band (e.g. 0.45–0.85) or the card is an "Explain why" card.

Cache grades by `(card_id, normalized_answer)`. Most daily reviews then cost zero LLM calls, which answers the brief's open question 11 ("can grading run offline?"): mostly yes, with the LLM as a queued upgrade.

### 6.4 Card generation
- Generation is a one-time cost per source. Spend calls here, not on reviews.
- One generation call per chunk, then one critique call per batch of cards (D3.2 step 5).
- Run de-duplication and grounding checks in code: embedding similarity, and an exact-substring check that each card's `source_quote` exists in the chunk.
- Generate paraphrases (B3.1, Phase 2) lazily, after a card survives triage, so discarded cards cost nothing extra.

### 6.5 Per-user quotas
Show quotas in plain words ("3 essay checks left today"). Suggested beta limits **[call]**: 5 essay feedbacks, 3 card generations of up to 20 pages, and unlimited reviews per user per day. Tune them from real router logs.

## 7. MVP scope

The brief's Phase 1 contains both tools in full (A2.1–A2.9, B2.1–B2.8) plus shared features. That is a large first build for one developer on free tiers.

**Recommendation [call]:** one shared shell, then two thin slices in order.

1. **Phase 0: evaluation harness first** (brief Part G). Build a CLI script that runs the essay and card prompts against 20 sample essays and 5 sample documents through the router, and saves outputs for rating. Free models vary in quality; this tells you which provider each task can trust before any UI exists.
2. **Phase 1a: shell + Recall.** Covers auth, onboarding (C4), the Today screen, Import (PDF and pasted text first; images, DOCX and PPTX next), generation, triage, review with the grading cascade, FSRS, and exam-date mode. Recall goes first because its daily cost is lowest after generation, it works offline, and it builds the daily habit.
3. **Phase 1b: Draft Coach.** Covers paste/upload, layered feedback, Top 3, rubric scores with confidence, the hint ladder, strengths, anchored comments, draft history, and feedback actions.

**Alternative:** Draft Coach first, if essay feedback is the sharper differentiator for the first users. The owner decides; record the choice in the brief's Part K.

**Cuts from MVP [call]:** `.pptx` import (move to 1a+), the desktop triage grid (ship the swipe stack with keyboard support on every screen size), and the draft side-by-side diff (ship inline diff only).

## 8. Expanded feature notes

### 8.1 Draft Coach

**Prioritization (A2.3).** Compute rank in code, not by the LLM, so it stays stable across runs:
`score = layer_weight × rubric_weight × severity × (1 + 0.25 × repeat_count)`, with layer weights global 3, paragraph 2, sentence 1. The LLM supplies severity and the criterion; code does the ranking. This also helps with open question 10 (score consistency).

**Rubric score stability (A2.4).** Use temperature 0. On low confidence, run a second scoring call only if quota allows. If the two scores differ by more than one level, show "estimate" rather than averaging.

**Anchoring (A2.7, D3.4).** The LLM returns a `quote`, not character offsets. Code finds the quote in the paragraph (exact match, then whitespace-normalized match) and computes the offsets. Drop any item whose quote can't be found. This removes a whole class of hallucinated anchors.

**Carry-over (A2.8).** On a new draft, match old items to new paragraphs by paragraph-embedding similarity, then ask the global pass to mark each carried item addressed, partial, or open. No separate call.

**Hint-level growth signal (A2.5).** Store the highest level viewed per item in `feedback_events`. Average it per category per student. A falling average is the "growing independence" metric (F1).

**Disagree (A3.10, Phase 2).** Moving a cheap version into MVP is a **[call]**: store the student's reason and mark the item "disputed." Defer the AI rebuttal to Phase 2. Disputes cost no LLM calls and give early quality data.

### 8.2 Recall

**Daily load cap (B2.6).** Enforce the new-card limit (default 20) and also cap total reviews shown per session at about 25 minutes of estimated work, with "Do more" available. This addresses the brief's review-pile problem (2.2).

**Exam-date mode (B2.8).** FSRS sets intervals from a desired retention. For exam mode:
- Cap every card's next interval at `days_until_exam − 1` so each card is seen again before the exam.
- If the forecast daily load exceeds the student's set minutes per day, rank cards by `importance × (1 − retrievability)` and schedule the top ones. Show plainly: "You can cover about 70% of this deck well by Friday. These 40 cards are the most important."
- Final 3 days: review every card with predicted retrievability below 0.8.

**Triage (B2.5).** Swipe right/left on touch; arrow keys and buttons everywhere, which also covers accessibility. Store discards with a reason chip (trivial, wrong, duplicate, unclear) so generation prompts can learn from them per user.

**Offline (B3.10).** Moving the minimum into MVP is a **[call]**: due cards and FSRS run on the device. Typed answers grade with cascade steps 1–3 offline. Answers needing the LLM sync and regrade later. Ratings already applied stay unless the regrade differs by more than one rating.

### 8.3 Combined platform (Part C)

**Today screen.** One list, in this order: overdue reviews (with time estimate), essays with open Top 3 items, exam countdowns. Show one primary action at the top: whichever item has the closest deadline.

**Essay → cards loop (C1, Phase 2).** A recurring error pattern becomes a 3–5 card mini-deck generated from a fixed template bank (e.g. comma splices). The bank is written once by hand, so the loop costs no LLM calls per student.

## 9. Data model changes to the brief (D2)

- Add `llm_calls (id, user_id, task, provider, model, tokens_in, tokens_out, latency_ms, status, created_at)` for quotas and provider evaluation.
- Add `quota_usage (user_id, day, essays, generations)`.
- Add `grade_cache (card_id, answer_hash, result jsonb)`.
- Store `feedback_items.anchor` as `{paragraph_id, quote, start, end}`. `start`/`end` are computed in code (§8.1).
- Add `users.birth_year` (or an 18+ attestation) for the beta age gate.
- Row Level Security on every table: students see only their own rows. Add class-scoped policies in Phase 3.
- Store only extracted text from uploads by default; keep the original file only if the student opts in. That saves storage quota and reduces privacy exposure.

## 10. Recommendations on the brief's open questions (Part J)

| # | Question | Recommendation **[call]** |
|---|---|---|
| 1 | B2C or B2B first? | B2C (adult students) for the beta. B2B needs teacher features, legal review, and reliable paid infrastructure. |
| 2 | Which persona first? | P2 (college students): they use both tools and are adults. |
| 3 | Launch together or one first? | One shell, Recall then Draft Coach (§7). |
| 4 | Ghostwriting strictness for adults? | Keep the same caps. They are the product's identity, not a minor-safety rule. |
| 5 | How many priorities? | 3 by default; 5 after a student addresses 3 in a row. |
| 6 | Hide or de-emphasize sentence feedback? | De-emphasize: collapsed, with a count badge. |
| 7 | Students who always need levels 4–5? | After 3 essays, start them at level 2 for that category, and suggest a Recall mini-deck for the pattern. |
| 8 | Card density? | Start at the brief's 5–15 per dense page. Learn per subject from triage keep rates. |
| 9 | Measure feedback quality cheaply? | Dispute rate, "Got it" rate, and addressed-on-next-draft rate per category, plus a monthly 20-essay human spot check. |
| 10 | Scoring consistency? | Temperature 0, code-side ranking, a pinned model per task, and re-running the Phase 0 harness on every prompt or model change. |
| 11 | Offline grading on device? | Mostly yes, via the cascade (§6.3). |
| 12 | Catch wrong cards? | Grounding substring check, a critique pass, triage, and a "Report a problem" button feeding the eval set. |
| 13–15 | Teacher trust, free-tier limit, integrations | Defer until Phase 3; record as open. |
| 16 | What makes students tell a friend? | Unproven guess: "it told me how much of the exam I can realistically cover, and was right." Test in the beta. |
| 17 | Why not just ask a chatbot? | Memory and process: draft history, carried-over feedback, a schedule, grounded cards, and a coach that refuses to just write it. |

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free models give feedback too weak to be useful | Product fails its core promise | Phase 0 harness before the UI; route essay global analysis to the strongest free model available |
| Free-tier terms or limits change | Sudden outages or privacy breaches | Router with failover; per-provider data flag; keep the provider list in config, not code |
| Supabase project pauses | First visitor after a quiet week waits, or a request fails | Daily cron ping; the client retries with a "waking up" message; drafts are saved locally first |
| LanguageTool flags dialect features as errors | Unfair feedback (E3) | Keep an allow-list of rule IDs; label convention-based items "academic convention" |
| Students treat cascade grades as gospel | Learning wrong answers | One-tap override (B2.7); log overrides and audit the cascade thresholds |

## 12. Left to the builder

- Exact free providers and models per task, chosen from Phase 0 results.
- Visual design system. Run `/impeccable` new-work once `PRODUCT.md` exists. The brief's layer colors (A5.4) are suggestions.
- Prompt wording (the brief's D4 drafts are the starting point).
- Folder structure, testing setup, and CI (GitHub Actions has a free tier).

## 13. Decisions to confirm (for the brief's Part K)

1. Beta is 18+ only (§5).
2. Order: Phase 0 harness, then Recall, then Draft Coach (§7).
3. Hosting on Cloudflare rather than Vercel Hobby (§4).
4. Sentence-level feedback uses LanguageTool, not an LLM (§6.2).
5. MVP includes cheap "disputed" marking and offline review (§8).
