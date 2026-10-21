# Phase 2a: Recall Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily review gets deeper without much LLM cost. Students can:
- manage their cards: edit, suspend, delete, act in bulk;
- say how confident they are before answering, and see how well-calibrated they are;
- get help with a card they keep failing;
- see which concepts are strong or weak, and how memory fades;
- mix topics in a session;
- get a summary that names which concepts improved and which need attention.

**Architecture:**
- **Mostly code over data that already exists:** `card_states` (FSRS stability, lapses), `reviews`, and `cards.concept`.
- **One new LLM task, `card_help`.** It runs only when a student asks for help with a card. The result is cached per card, and the call takes the daily helper quota (the existing `consume_hint_quota`) before it runs.
- **One forward migration:**
  - a `suspended` card status;
  - an optional `confidence` on reviews, which `record_review` accepts and still works without;
  - a `card_aids` cache table.
- **Calculations in `src/review/`, next to `schedule.ts`:** calibration, strength, the forgetting curve and interleaving are pure functions there, so they're unit-testable.

**Tech Stack:** unchanged (Next.js 16, Supabase, `ts-fsrs` 5.4, vitest). No new dependencies. Charts are hand-written SVG; load the `dataviz` skill before Task 5.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§6, §8.2), plus the overview `docs/superpowers/plans/2026-10-21-phase2-overview.md`. Brief: B3.2, B3.3, B3.4, B3.5, B3.8, B3.9, B-S5, B-S6, B-S7, B-S8, C2 (calibration).

**Depends on:**
- 1a: `buildSession`, `applyRating`, `retrievability`, `makeScheduler`, `loadStudy`, `ReviewSession`, the outbox and `syncOutbox`, `record_review`.
- 1a-2: `cards`, `updateStatus`, `updateCard`, `isGrounded`, the triage page.
- 1b: `consume_hint_quota`, `logCalls`, `compactSchema`.

## Global Constraints

- Everything in `CLAUDE.md` and the earlier plans' Global Constraints applies. In particular:
  - schemas `scholar` and `scholar_private` only;
  - migrations are hand-written, and the owner sees each one before it's applied;
  - `requireNoTraining: true`.
- **Confidence levels:** Guessing (1), Unsure (2), Confident (3).
  - Choosing one is optional, and skipping it never blocks answering.
  - Keys: `G`, `U` and `C` while the answer field is empty and not focused. Plain chips work everywhere.
- **Calibration score [call]:** expected accuracy by level is Guessing 0.33, Unsure 0.6, Confident 0.9. Score = `round(100 × (1 − mean |expected − correct|))`, where correct means a final rating of Good or Easy. Shown only after at least 10 reviews with a confidence level.
- **Confidently wrong** (Confident, then a final rating of Again): show "You felt sure about this one, so it's worth a second look." followed by the card's source quote ("From your notes: …"). No schedule change beyond what FSRS already does for Again **[call]**.
- **Leech:** `card_states.lapses >= 4` (brief B3.3).
- **Strength** = mean current retrievability of a concept's kept cards that have a state:
  - Strong ≥ 0.9, Shaky ≥ 0.7, Weak < 0.7.
  - Concepts with no reviewed card are "Not started".
  - Always shown as a text label as well as colour.
- **Concept identity:** `concept.trim().toLowerCase()` for grouping. Display uses the most common original spelling.
- **`card_help`:**
  - Groq first (low reasoning effort). Output uses the compact shape.
  - Cached in `card_aids`; a second request returns the cache with no call.
  - Split cards (at most 3) are saved as `pending` in the same deck and chunk, and only if `isGrounded(chunk.text, source_quote)`. Ungrounded ones are dropped and counted.
  - Never more than 120 words of explanation.
- **Interleaving** ("Mix topics", off by default): round-robin across concepts, keeping each concept's due order. Two cards of the same concept are never adjacent while another concept still has cards left.
- **Copy:** no guilt and no streaks. "This card keeps slipping. Want a different way in?" is the leech prompt.

## Review Focus

1. **A card is deleted while one of its reviews is still waiting in the device outbox.** `record_review` raises `42501 card not found`. Expect the outbox to drop that row instead of retrying it forever, while other failures still stay queued. Tested in Task 2.
2. **A device whose outbox holds reviews from before this release (no `confidence` field) syncs after the migration.** Expect `record_review` to accept them unchanged. Tested in Task 1.
3. **`card_help` returns split cards whose `source_quote` isn't in the chunk.** Expect them dropped and counted, never saved. Tested in Task 4.
4. **Concepts spelled differently ("Glycolysis", " glycolysis ") or containing `&`, `/` or `?`.** Expect them grouped as one concept, and expect the concept link to round-trip through the URL. Tested in Task 5.
5. **A suspended card that was mid-schedule.** Expect it to drop out of sessions, Today counts and the mastery map. When unsuspended, it returns with its old FSRS state, not reset. Tested in Task 2.

---

### Task 1: Migration: suspended cards, review confidence, card aids

**Files:**
- Create: `supabase/migrations/20261022120000_scholar_recall_depth.sql`
- Test: `tests/db/recall-depth.test.ts`

**Interfaces:**
- **`scholar.cards.status`:** the check becomes `in ('pending','kept','discarded','suspended')`.
- **`scholar.reviews`:** gains `confidence smallint check (confidence between 1 and 3)`, nullable.
- **`scholar_private.record_review(p_review jsonb, p_state jsonb)`:** `create or replace`, keeping every existing check.
  - It also accepts an optional `confidence`: a JSON number 1–3, or absent or null. Anything else raises `22023`.
  - It stores the value.
- **`scholar.card_aids`:**
  - Columns: `card_id uuid primary key references scholar.cards on delete cascade`, `user_id`, `result jsonb not null`, `created_at`.
  - RLS on: owner select, plus insert only for the owner's own card (the `grade_cache` pattern). No update or delete grant.
- **Indexes:** `card_aids (user_id)`.

- [ ] **Step 1: Write the failing tests**
```ts
test('a card can be suspended and is excluded by status filters', ...);
test('record_review stores confidence 1-3 and rejects 0, 4 and "3"', ...);
test('record_review without confidence still works (outbox from before this release)', ...);
test('card_aids: owner can insert and read for own card only; no update', ...);
```
- [ ] **Step 2: Run, expect FAIL:** `npm run test:db -- tests/db/recall-depth.test.ts`
- [ ] **Step 3:** Write the migration and show it to the owner. Apply it after approval, then run the advisors.
- [ ] **Step 4: Run, expect PASS:** the full `npm run test:db`, and the advisors clean for `scholar`.
- [ ] **Step 5: Commit:** `feat: suspended cards, review confidence, card aids`

---

### Task 2: Deck and card editor (B-S8)

**Files:**
- Create:
  - `src/app/(app)/study/deck/[deckId]/page.tsx`
  - `src/app/(app)/study/deck/[deckId]/card-list.tsx` (client)
  - `src/app/(app)/study/deck/[deckId]/actions.ts`
- Modify:
  - `src/lib/triage/card-actions.ts` (`updateStatus` accepts `'suspended'`; add `deleteCards`)
  - `src/app/(app)/study/decks.tsx` (the deck title links to `/study/deck/{id}`, and leeches are counted)
  - `src/review/sync.ts` (drop a row whose card no longer exists)
- Test: `tests/app/card-list.test.tsx`, `tests/db/card-editor.test.ts`, `tests/review/sync.test.ts` (extend)

**Interfaces:**
- **New and changed functions:**
```ts
export async function deleteCards(db: Db, userId: string, ids: string[]): Promise<void>;   // 1..200 uuids, scoped to userId
// updateStatus(db, userId, ids, status: 'kept' | 'discarded' | 'suspended', reason?)
// sync.ts: SyncDeps.recordReview rejecting with { code: '42501' } deletes that outbox row and counts it in a new `dropped` field.
export async function syncOutbox(deps: SyncDeps, now: Date): Promise<{ sent: number; regraded: number; failed: number; dropped: number }>;
```
- **Server actions** in `actions.ts`, thin wrappers over the lib functions as in `study/triage/actions.ts`:
  - `setStatus(ids, 'kept' | 'suspended')`
  - `removeCards(ids)`
  - `saveCard(id, { front, back })`, which reuses `updateCard`
- **The page** lists the deck's cards with status `kept`, `pending` or `suspended` (never `discarded`). Each row shows:
  - front and back;
  - the type label;
  - the concept;
  - status ("Suspended" as text);
  - "Slipping" when lapses ≥ 4.
- **Tools on the page:**
  - search across front and back (case-insensitive, on the client);
  - filters for type, status and concept;
  - inline edit;
  - suspend or unsuspend;
  - delete, which asks "Delete N cards? Their review history goes too.";
  - bulk select (checkbox per row, plus "Select all shown").
- **Pending cards** link to their source's triage page instead of offering suspend.

- [ ] **Step 1: Write the failing tests**
```ts
test('search and filters narrow the list; Select all shown selects only visible rows', ...);
test('bulk suspend then unsuspend keeps the card state (reps, due) unchanged', ...);   // db
test('delete asks first and removes cards with their states and reviews', ...);
test('another user card ids are ignored by setStatus and removeCards', ...);            // db
test('a queued review for a deleted card is dropped, other failures stay queued', ...); // sync
test('suspended cards are absent from loadStudy and from the Study deck counts', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md (bordered rows, 44px targets, a labelled checkbox per row).
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: deck and card editor with suspend, delete and bulk actions`

---

### Task 3: Confidence before reveal and calibration (B3.2, C2)

**Files:**
- Create: `src/review/calibration.ts`
- Modify:
  - `src/lib/review/load.ts` (select `source_quote` into `ReviewCard.sourceQuote`)
  - `src/review/store.ts` (`ReviewPayload.confidence?: 1 | 2 | 3`)
  - `src/app/(app)/study/review/session.tsx`
  - `src/app/(app)/study/review/summary.tsx`
  - `src/app/(app)/profile/page.tsx`
- Test: `tests/review/calibration.test.ts`, `tests/app/review-session.test.tsx` (extend), `tests/app/today.test.tsx` (the Profile test, extend)

**Interfaces:**
```ts
export type Confidence = 1 | 2 | 3;
export const EXPECTED: Record<Confidence, number> = { 1: 0.33, 2: 0.6, 3: 0.9 };
export function calibration(rows: { confidence: Confidence; final_rating: number }[]): { score: number; n: number } | null; // null below 10 rows
```
- **On the session screen**, before the answer field: a radio group "How sure are you?" with the three chips. The chosen level goes into the review payload.
- **After rating**, a Confident + Again shows the confidently-wrong note with the source quote (`ReviewCard.sourceQuote`).
- **After any card is checked**, a "View source" toggle shows that quote too (brief B-S5).
- **Profile** gets a "Self-check accuracy" row: "78% (from 24 answers)", or "Answer with a confidence level 10 times to see this."
- **The summary** shows the score when the session alone had at least 10 confidence ratings.

- [ ] **Step 1: Write the failing tests**
```ts
test('calibration: all Confident and correct scores 90; all Guessing and wrong scores 67; under 10 rows is null', ...);
test('choosing Confident then rating Again shows the note with the source quote', ...);
test('confidence is optional: answering without it still saves a review without the field', ...);
test('G, U, C keys set confidence only while the answer field is not focused', ...);
test('Profile shows Self-check accuracy or the 10-answer hint', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test`.
- [ ] **Step 5: Commit:** `feat: confidence before reveal and a calibration score`

---

### Task 4: Card help for leeches and mnemonics (B3.3, B3.8)

**Files:**
- Create: `src/lib/cards/help.ts`, `src/app/api/cards/help/route.ts`
- Modify:
  - `src/llm/types.ts` (`TaskName` gains `'card_help'`)
  - `src/llm/config.ts` (`card_help: ['groq', 'gemini', 'openrouter', 'ollama']`)
  - `src/llm/schemas.ts`
  - `src/llm/prompts.ts`
  - `src/app/(app)/study/review/session.tsx` (links)
  - `docs/superpowers/notes/2026-10-21-token-budget.md` (add a row)
- Test: `tests/llm/card-help-prompt.test.ts`, `tests/db/card-help.test.ts`, `tests/app/review-session.test.tsx` (extend)

**Interfaces:**
```ts
export const CardHelp = z.object({
  explanation: z.string().min(1), mnemonic: z.string().min(1), analogy: z.string().min(1),
  split: z.array(Card.omit({ importance: true })).max(3),
});
export function cardHelpPrompt(i: { front: string; back: string; keyPoints: string[]; chunk: string }): Prompt; // card + chunk in wrapData; compact shape
export async function requestCardHelp(db: Db, userId: string, cardId: string, env: Record<string, string | undefined>,
  completeFn?: typeof complete): Promise<{ ok: true; help: { explanation: string; mnemonic: string; analogy: string }; added: number; dropped: number; cached: boolean }
  | { ok: false; status: 404 | 429 | 503; message: string }>;
export async function POST(req: NextRequest): Promise<NextResponse>; // body { cardId: uuid }; 400/401/403 as in the other routes
```
- **Order of operations:**
  1. Load the card through RLS (404 if missing).
  2. Return the cached `card_aids` row if there is one.
  3. `consume_hint_quota`. If it returns false: 429 "You've asked for a lot of help today. More unlocks at midnight UTC."
  4. Call `card_help` and log it.
  5. Keep only grounded split cards, and insert them as `pending` with `importance` copied from the parent.
  6. Save `card_aids`, then return.
- **The prompt:**
  - Explanation at most 120 words, at a different angle from the back.
  - The mnemonic must be honest: no false facts.
  - Split cards are atomic and grounded with `source_quote` copied exactly from the chunk.
  - The system prompt is static (no student-controlled text).
- **The UI:**
  - After any card is checked: a "Make a mnemonic" link.
  - After an Again on a leech: the leech prompt plus a "Get help" button.
  - Both open a panel: the explanation, the mnemonic, the analogy, and "N new cards added to your deck for sorting" linking to triage when `added > 0`.
- **Eval:** add a `card_help` case to `eval/runEval.ts` for the sample doc's first card. Record its tokens in the token-budget note.

- [ ] **Step 1: Write the failing tests**
```ts
test('card help prompt wraps card and chunk as data, uses the compact shape, keeps the system prompt static', ...);
test('second request is served from card_aids with no LLM call', ...);
test('ungrounded split cards are dropped and counted; grounded ones are saved pending in the same deck', ...);
test('daily helper limit reached is 429 with no LLM call', ...);
test('another user card is 404 with no LLM call', ...);
test('Again on a leech shows the slipping prompt; Get help shows explanation, mnemonic and the triage link', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, then run the eval case and add the token-budget row.
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: card help for leeches and mnemonics`

---

### Task 5: Mastery map and forgetting curve (B3.4, B3.5, B-S7)

**Files:**
- Create:
  - `src/review/mastery.ts`
  - `src/app/(app)/study/mastery/page.tsx`
  - `src/app/(app)/study/mastery/mastery-view.tsx`
- Modify:
  - `src/lib/review/load.ts` (select `concept` into `ReviewCard.concept`; Task 3 already added `sourceQuote`)
  - `src/app/(app)/study/page.tsx` (a "Mastery map" link)
- Test: `tests/review/mastery.test.ts`, `tests/app/mastery.test.tsx`

**Interfaces:**
```ts
export type Strength = 'strong' | 'shaky' | 'weak' | 'not started';
export type ConceptMastery = { key: string; label: string; deckId: string; cards: number; strength: Strength; retrievability: number | null };
export function conceptMastery(cards: ReviewCard[], now: Date): ConceptMastery[];         // grouped by deck then concept key; weakest first
export function forgettingCurve(cards: ReviewCard[], now: Date, days = 30): { day: number; ifIdle: number; ifReviewedToday: number }[];
// ifIdle: mean retrievability over reviewed cards on each future day with no reviews.
// ifReviewedToday: the same, after applying a Good rating today to every card due today (applyRating with a no-fuzz scheduler).
```
- **The page:** one section per deck.
  - A grid of concept tiles. Each shows the label, "N cards", and the strength as text plus colour.
  - Each tile links to `/study/review?deck={id}&concept={encodeURIComponent(key)}`.
  - A 30-day line chart with two labelled lines ("If you stop now" and "If you review today's cards"). It has a text summary under it ("In 2 weeks you'd remember about 54%; reviewing today keeps it near 81%."), and a data table toggle for screen readers.
- **Build the chart with the `dataviz` skill.**

- [ ] **Step 1: Write the failing tests**
```ts
test('conceptMastery groups "Glycolysis" and " glycolysis " and labels strength by thresholds 0.9/0.7', ...);
test('concepts with no reviewed card are not started and sort last', ...);
test('forgettingCurve decays without review and the reviewed-today line stays above it', ...);
test('a concept with & / ? round-trips through the review link', ...);
test('mastery page shows strength as text and a text summary of the curve', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md, with the chart built using the `dataviz` skill.
- [ ] **Step 4: Run, expect PASS:** `npm test`.
- [ ] **Step 5: Commit:** `feat: mastery map and forgetting curve`

---

### Task 6: Focused and mixed sessions, richer summary (B3.9, B-S6)

**Files:**
- Create: `src/review/interleave.ts`
- Modify:
  - `src/app/(app)/study/review/page.tsx` (read `deck` and `concept` search params)
  - `src/app/(app)/study/review/session.tsx` (a "Mix topics" switch)
  - `src/app/(app)/study/review/summary.tsx`
- Test: `tests/review/interleave.test.ts`, `tests/app/review-session.test.tsx` (extend)

**Interfaces:**
```ts
export function interleave<T extends { concept: string }>(queue: T[]): T[]; // round-robin by concept key, keeping each concept's order
export function conceptSummary(done: { concept: string; rating: number }[]): { improved: string[]; needsAttention: string[] }; // at most 3 each
```
- **Focused session:** a `concept` search param limits the session to that deck's cards whose concept key matches. The heading reads "Review: {label}".
- **"Mix topics":** off by default. The choice is remembered in `localStorage` under `scholar-mix-topics` (try/catch around every access).
- **The summary** adds:
  - "Got stronger: …" (concepts rated Good or Easy every time this session);
  - "Needs another look: …" (any Again).
  - Each lists at most 3 concepts.

- [ ] **Step 1: Write the failing tests**
```ts
test('interleave never puts two cards of one concept side by side while another concept has cards left', ...);
test('interleave keeps each concept\'s own due order', ...);
test('a concept-focused session only shows that concept\'s cards and names it in the heading', ...);
test('summary lists concepts that got stronger and that need another look', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test`, then `npm run build`.
- [ ] **Step 5: Commit:** `feat: concept-focused and mixed sessions, concept summary`

---

## Out of scope for 2a

Everything assigned to 2b, 2c and 2d in the overview. Also left out:
- **the "simple image idea" part of B3.8 [call]:** a text suggestion without an image renderer adds little;
- **"Improve with AI" in the card editor (B-S8) [call]:** card help covers the struggling-card case, and a general rewrite of a card should go through triage-quality checks first;
- teacher or class decks (Phase 3);
- image occlusion and the other Phase 2 card types (2d).
