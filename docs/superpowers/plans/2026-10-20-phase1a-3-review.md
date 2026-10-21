# Phase 1a-3: Review Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user studies kept cards daily: they type answers that are graded for meaning, mostly on the device, and FSRS schedules the next review. Exam-date mode compresses that schedule. Reviews work offline and sync later. Today says what to study now.

**Architecture:** Scheduling runs on the client with `ts-fsrs` 5.4 so review works offline. Answers are graded by a cascade in `src/review/grade.ts` (exact → fuzzy → on-device embedding → LLM). The LLM step, `POST /api/grade`, runs only for uncertain answers and "why" cards, and caches by answer hash. Reviews queue in IndexedDB (Dexie) and sync through one idempotent SQL function. A small hand-written service worker caches the app shell for offline use.

**Tech Stack:** Plans 1a-1/1a-2 stack, plus `ts-fsrs` 5.4.2, `dexie` 4.4, and `fake-indexeddb` (dev, tests).

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§6.3, §8.2 Daily load cap / Exam-date mode / Offline, §8.3 Today, §9). Brief: B2.6, B2.7, B2.8, B-S1, B-S4, B-S5, B-S6, B-S11, B5.4, B5.5.

**Depends on:** plans 1a-1 and 1a-2 (tables `decks`, `cards`, `profiles`; `getEmbedder`, `cosine`; `requireOnboardedUser`; shell).

## Global Constraints

- Everything in plans 1a-1 and 1a-2 Global Constraints applies.
- Desired retention 0.9, fuzz on (brief B2.6).
- New-card limit 20 per day (brief B2.6). Session cap = the profile's `study_minutes_per_day`, with a "Do more" option (spec §8.2). Time estimate 25 seconds per card **[call]**, from the brief's "18 cards · ~7 min".
- Score to rating (brief B2.7): `< 0.4` Again, `0.4–0.69` Hard, `0.7–0.89` Good, `≥ 0.9` Easy only when answered within 10 seconds **[call]**, otherwise Good.
- The LLM grades only when the card type is `why` or the cascade score is in `[0.45, 0.85]` (spec §6.3).
- The student can override any suggested rating with one tap; overrides are stored (`final_rating ≠ suggested_rating`).
- Offline regrade rule: a rating already applied stays unless the later LLM grade differs by more than one rating step (spec §8.2).
- Exam mode: no card's next due date passes the day before the exam. In the final 3 days, every kept card with retrievability < 0.8 is due (spec §8.2).
- No guilt-based copy and no streak pressure. Streaks are deferred **[call]** (brief B5.4 requires freeze days; build them with streaks later).
- Accessibility: the review session works with keyboard alone; the answer field is labelled; feedback is announced in a live region; rating buttons show text, not only color.

## Review Focus

1. **The same review is synced twice after a flaky network.** Expect one `reviews` row and one state update. Tested in Task 1.
2. **A card reviewed offline on a phone and again on a laptop before the phone syncs.** Expect the later `last_review` to win, with no double-applied lapse. Tested in Task 1.
3. **Exam date today or in the past.** Expect exam mode ignored and no negative interval caps. Tested in Task 2.
4. **A typo answer ("electron transport chian").** Expect the fuzzy step to accept it as Good with no LLM call. Tested in Task 3.
5. **Grading unavailable (offline or a 503) for a "why" card.** Expect a fall back to the self-grade buttons and the regrade queued for later (brief B5.5). Tested in Tasks 3 and 6.

---

### Task 1: Review tables and the idempotent `record_review` function

> **Amended 2026-10-20 (shared project, see plans 1a-1 Task 2 and 1a-2 Task 1).** All tables live in schema `scholar`; write the migration by hand at `supabase/migrations/20261020150000_scholar_review.sql`; the controller applies it after the owner sees it. Every table: `revoke all ... from public, anon, authenticated`, then the listed grants, plus `grant all ... to service_role`. `record_review` follows the 1a-2 quota pattern directly: `scholar_private.record_review(p_review jsonb, p_state jsonb)` as `security definer`, `set search_path = ''`, fully qualified names, explicit ownership check that the card belongs to `(select auth.uid())`, every jsonb field validated (types, ranges, `final_rating` 1..4, `state` 0..3, timestamps not in the future by more than 5 minutes); a `scholar.record_review` `security invoker` wrapper; execute granted to `authenticated` on both, revoked from `public`/`anon`. `grade_cache` insert is allowed only for the caller's own cards. Users get no direct insert/update on `card_states` or `reviews`. DB tests reuse `tests/db/helpers.ts` and build fixtures with `insertSource` plus admin card inserts.

**Files:**
- Create: `supabase/migrations/<timestamp>_review.sql` (via `npx supabase migration new review`)
- Test: `tests/db/review.test.ts`

**Interfaces:**
- Produces tables (RLS on; ownership policies as in 1a-2; grants to `authenticated` only):

| table | columns | grants |
|---|---|---|
| `card_states` | `card_id uuid pk references cards on delete cascade`, `user_id`, `due timestamptz not null`, `stability real not null`, `difficulty real not null`, `scheduled_days int not null`, `learning_steps int not null`, `reps int not null`, `lapses int not null`, `state smallint not null check (state between 0 and 3)`, `last_review timestamptz` | select |
| `reviews` | `id uuid pk`, `client_review_id uuid not null unique`, `card_id uuid not null references cards on delete cascade`, `user_id`, `answer_text text`, `grade_source text not null check (grade_source in ('exact','fuzzy','embedding','llm','self'))`, `ai_score real check (ai_score between 0 and 1)`, `suggested_rating smallint check (suggested_rating between 1 and 4)`, `final_rating smallint not null check (final_rating between 1 and 4)`, `response_ms int`, `reviewed_at timestamptz not null` | select |
| `grade_cache` | `card_id uuid references cards on delete cascade`, `answer_hash text`, `user_id`, `result jsonb not null`, `created_at`, primary key `(card_id, answer_hash)` | select, insert |

- Index: `card_states (user_id, due)`.
- Produces `public.record_review(p_review jsonb, p_state jsonb) returns void`, `security invoker`, `set search_path = ''`. It inserts into `reviews ... on conflict (client_review_id) do nothing`. It upserts `card_states` only when no row exists or `excluded.last_review > card_states.last_review`. Both writes check that the card belongs to `auth.uid()`. If invoker rights block the writes without table grants, use the private-schema security-definer pattern from 1a-2 Task 1 and ledger it. Users must not write `card_states`/`reviews` directly.
- `elapsed_days` (deprecated in ts-fsrs 5, removed in 6) is not stored. Code sets it to 0 when building a ts-fsrs `Card`.

- [ ] **Step 1: Write the failing tests**

```ts
test('same client_review_id twice creates one review', ...);
test('older last_review does not overwrite a newer state', ...);
test('cannot record a review for another user card', ...);
test('direct insert into reviews is denied', ...);
test('final_rating 5 is rejected', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test:db` → relations missing.

- [ ] **Step 3: Write the migration, push it, run the advisors.**

- [ ] **Step 4: Run, expect PASS** — `npm run test:db` → all passed; advisors clean.

- [ ] **Step 5: Commit** — `git commit -m "feat: review tables and idempotent record_review"`

---

### Task 2: Scheduler and exam mode

**Files:**
- Create: `src/review/schedule.ts`
- Test: `tests/review/schedule.test.ts`

**Interfaces:**
- Produces (pure, no I/O; `now` and `examDate` always passed in):
```ts
import { Rating, type Card as FsrsCard, type ReviewLog } from 'ts-fsrs';
export type Grade = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy;
export interface StateRow { card_id: string; due: string; stability: number; difficulty: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: number; last_review: string | null }
export interface StudyCard { id: string; deckId: string; type: 'basic' | 'cloze' | 'why'; importance: 1 | 2 | 3; state: StateRow | null }
export const SECONDS_PER_CARD = 25;
export const NEW_CARD_LIMIT = 20;
export function toFsrs(s: StateRow | null, now: Date): FsrsCard;                 // null → createEmptyCard(now); elapsed_days 0
export function fromFsrs(cardId: string, c: FsrsCard): StateRow;
export function applyRating(card: StudyCard, rating: Grade, now: Date, examDate: Date | null): { state: StateRow; log: ReviewLog };
//   f.next(...) then, when examDate is after the end of today, cap due at examDate minus 1 day (start of that local day) and recompute scheduled_days.
export function retrievability(s: StateRow | null, at: Date): number;            // null → 0
export interface SessionOptions { now: Date; minutes: number; newIntroducedToday: number; examDate: Date | null; doMore?: boolean }
export function buildSession(cards: StudyCard[], o: SessionOptions): { queue: StudyCard[]; dueCount: number; estMinutes: number };
export function readiness(cards: StudyCard[], examDate: Date): number;           // mean retrievability at examDate, 0..1
export function newCardCapacity(newCount: number, daysLeft: number, minutes: number): number; // floor(daysLeft * minutes * 60 / SECONDS_PER_CARD / 3), capped at newCount [call]: a new card needs about 3 reviews before an exam
```
- `buildSession` order:
  1. Due review cards (`due ≤ now`). Sort by due ascending, or by `importance × (1 − retrievability)` descending when exam mode is on and the due load is more than `minutes`.
  2. In exam mode's final 3 days, add any kept card with retrievability < 0.8.
  3. New cards (`state === null`), at most `NEW_CARD_LIMIT − newIntroducedToday`, highest importance first.
  4. Cut the queue at `minutes * 60 / SECONDS_PER_CARD` cards unless `doMore`.

- [ ] **Step 1: Write the failing tests** (fixed `now = new Date('2026-11-02T09:00:00')`)

```ts
test('new card rated Good gets a future due date', ...);
test('exam in 5 days caps due at the day before the exam', ...);  // a mature card whose normal interval is 30 days → due 2026-11-06
test('exam today or past is ignored', ...);                        // same card → interval uncapped
test('session respects the new-card limit and minutes cap', ...);  // 40 new, minutes 10 → 24 cards max, new ≤ 20
test('doMore lifts the minutes cap but not the new-card limit', ...);
test('exam priority ranks importance × (1 − R) when overloaded', ...);
test('final 3 days include weak kept cards that are not due', ...);
test('readiness of all-new deck is 0 and estMinutes uses 25 s per card', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/review/schedule.test.ts` → module not found.

- [ ] **Step 3: Implement** with `fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))`. Tests that compare exact dates construct the scheduler with `enable_fuzz: false` through an exported `makeScheduler(fuzz: boolean)`.

- [ ] **Step 4: Run, expect PASS** — the test file passes.

- [ ] **Step 5: Commit** — `git commit -m "feat: FSRS scheduling with exam-date cap and session builder"`

---

### Task 3: Grading cascade

**Files:**
- Create: `src/review/grade.ts`
- Test: `tests/review/grade.test.ts`

**Interfaces:**
- Consumes: `EmbedFn`, `cosine` (1a-2 Task 5); `Rating` (ts-fsrs).
- Produces:
```ts
export function normalizeAnswer(s: string): string;          // NFKC, lowercase, strip punctuation, drop a/an/the, collapse spaces
export function similarity(a: string, b: string): number;    // 1 - levenshtein / max(len); both normalized; '' vs '' = 1
export function scoreToRating(score: number, responseMs: number): Grade;
export interface CascadeInput { type: 'basic' | 'cloze' | 'why'; reference: string; keyPoints: string[]; answer: string; responseMs: number }
export interface CascadeResult { score: number; source: 'exact' | 'fuzzy' | 'embedding'; hit: string[]; missed: string[]; suggested: Grade; needsLlm: boolean }
export async function gradeLocally(i: CascadeInput, embed: EmbedFn | null): Promise<CascadeResult>;
```
- Cascade values **[call]**:
  - Exact: normalized answer equals normalized reference, so score 1.
  - Fuzzy: reference ≤ 8 words and `similarity ≥ 0.85`, so score = similarity.
  - Embedding: with the embedder, a key point counts as hit when `cosine(answer, kp) ≥ 0.75`, and score = hits / keyPoints. With no key points, score = `cosine(answer, reference)` clamped to [0, 1].
  - No embedder: score = similarity, with `source: 'fuzzy'`.
  - `needsLlm = type === 'why' || (score >= 0.45 && score <= 0.85)`. Exact and fuzzy hits never need the LLM.
  - A blank answer scores 0 with `needsLlm: false`.

- [ ] **Step 1: Write the failing tests**

```ts
test('typo "electron transport chian" is fuzzy Good with no LLM', async () => {
  const r = await gradeLocally({ type: 'basic', reference: 'The electron transport chain.', keyPoints: ['electron transport chain'], answer: 'the electron transport chian', responseMs: 12000 }, null);
  expect(r).toMatchObject({ source: 'fuzzy', suggested: Rating.Good, needsLlm: false });
});
test('exact match within 10 s is Easy; after 10 s is Good', ...);
test('why card always needs LLM', ...);
test('embedding: one of two key points hit gives 0.5 and needs LLM', ...);   // fake embed fn with fixed vectors
test('blank answer is Again with no LLM', ...);
test.each([[0.39, 'Again'], [0.4, 'Hard'], [0.69, 'Hard'], [0.7, 'Good'], [0.89, 'Good']])('scoreToRating(%s)', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/review/grade.test.ts` → module not found.

- [ ] **Step 3: Implement** (a Levenshtein two-row DP inline; no dependency).

- [ ] **Step 4: Run, expect PASS** — the test file passes.

- [ ] **Step 5: Commit** — `git commit -m "feat: on-device grading cascade"`

---

### Task 4: LLM grade route with cache

**Files:**
- Create: `src/app/api/grade/route.ts`, `src/lib/grade/grade-with-llm.ts`
- Test: `tests/lib/grade-with-llm.test.ts`, `tests/db/grade-route.test.ts`

**Interfaces:**
- Consumes: `complete`, `gradeAnswerPrompt`, `GradeAnswer` (Phase 0); `normalizeAnswer` (Task 3); `grade_cache`, `llm_calls` (Tasks 1, 1a-2).
- Produces:
```ts
export async function answerHash(cardId: string, answer: string): Promise<string>;   // SHA-256 hex of cardId + '\n' + normalizeAnswer(answer), via crypto.subtle
export async function gradeWithLlm(db: SupabaseClient, userId: string, cardId: string, answer: string,
  env: Record<string, string | undefined>, completeFn?: typeof complete):
  Promise<{ ok: true; result: GradeAnswer; cached: boolean } | { ok: false; status: 404 | 503 }>;
export async function POST(req: NextRequest): Promise<NextResponse>;   // body {cardId: uuid, answer: string ≤ 2000 chars}; 400/401 as in 1a-2
```
- The route loads the card through RLS (404 when missing), checks `grade_cache`, then calls `complete('grade_answer', gradeAnswerPrompt({question: front, reference: back, keyPoints, answer}), GradeAnswer, { env })`. It stores the cache row and logs `llm_calls`. Grading does not consume the generation quota (spec §6.5: reviews unlimited). `ponytail:` no per-user grade limit; add one if `llm_calls` shows abuse.

- [ ] **Step 1: Write the failing tests**

```ts
test('second identical answer is served from cache with no LLM call', ...);
test('answers differing only in case and punctuation share a cache entry', ...);
test('another user card is 404 with no LLM call', ...);
test('AllProvidersFailedError gives 503 and logs calls', ...);
test('answer over 2000 chars is 400', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` and `npm run test:db` → modules not found.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS** — both suites pass.

- [ ] **Step 5: Commit** — `git commit -m "feat: cached LLM grading route"`

---

### Task 5: Offline store, sync, and app-shell service worker

**Files:**
- Create: `src/review/store.ts`, `src/review/sync.ts`, `public/sw.js`, `src/components/register-sw.tsx`
- Test: `tests/review/sync.test.ts` (with `fake-indexeddb/auto`)

**Interfaces:**
- Consumes: `applyRating`, `StateRow`, `StudyCard` (Task 2); `record_review` (Task 1); `/api/grade` (Task 4).
- Produces:
```ts
// store.ts — Dexie db 'scholar' v1, tables:
//   cards: id, deckId, ...StudyCard fields + front, back, keyPoints
//   states: card_id
//   outbox: client_review_id, review, prevState (StateRow | null, for regrade), state (StateRow), needsRegrade (0|1)
export type ReviewPayload = { client_review_id: string; card_id: string; answer_text: string | null;
  grade_source: 'exact' | 'fuzzy' | 'embedding' | 'llm' | 'self'; ai_score: number | null; suggested_rating: Grade | null;
  final_rating: Grade; response_ms: number | null; reviewed_at: string };   // mirrors the reviews row (Task 1)
export class ScholarDB extends Dexie { /* the three tables above */ }
export const db: ScholarDB;
export async function cacheDueCards(cards: (StudyCard & { front: string; back: string; keyPoints: string[] })[]): Promise<void>;
export async function enqueueReview(review: ReviewPayload, prevState: StateRow | null, state: StateRow, needsRegrade: boolean): Promise<void>;
// sync.ts
export interface SyncDeps { recordReview: (review: ReviewPayload, state: StateRow) => Promise<void>;
  grade: (cardId: string, answer: string) => Promise<{ ok: true; suggested: Grade } | { ok: false }> }
export async function syncOutbox(deps: SyncDeps, now: Date): Promise<{ sent: number; regraded: number; failed: number }>;
//   For each outbox row in reviewed_at order: if needsRegrade, try grade(). When the LLM rating differs from final_rating
//   by more than 1, rebuild the state from prevState with applyRating(…, llmRating, reviewed_at, examDate) and set
//   final_rating and grade_source='llm'. Then call recordReview and delete the row. A failed call keeps the row and moves on.
```
- `public/sw.js`, hand-written and dependency-free **[call]**, instead of Serwist: Serwist targets webpack builds and Next 16 defaults to Turbopack. Upgrade if offline needs grow.
  - Cache-first for `/_next/static/*` and fonts.
  - Network-first for navigations to `/today` and `/study/review`, falling back to the cached copy.
  - Never caches `/api/*`.
  - Cache name `scholar-shell-v1`.
- `RegisterSW` registers it in production only; it is mounted in the root layout.
- Sync runs on `online` events and when the review page mounts.

- [ ] **Step 1: Write the failing tests**

```ts
test('outbox rows sync in reviewed_at order and are deleted', ...);
test('failed recordReview keeps the row for the next sync', ...);
test('regrade differing by 1 keeps the applied rating', ...);         // applied Good(3), LLM Hard(2) → stays 3, grade_source stays local
test('regrade differing by 2 replaces rating and state', ...);        // applied Easy(4), LLM Hard(2) → final 2, state recomputed
test('regrade unavailable leaves needsRegrade set but still syncs the review', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/review/sync.test.ts` → module not found.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS** — the test file passes. Manual check: `npm run build && npm start`, open `/study/review`, switch DevTools to offline, reload. The page loads from the cache and a review queues in the outbox.

- [ ] **Step 5: Commit** — `git commit -m "feat: offline review outbox, sync with regrade rule, shell service worker"`

---

### Task 6: Review session, answer feedback, and summary

**Files:**
- Create: `src/app/(app)/study/review/page.tsx`, `src/app/(app)/study/review/session.tsx` (client), `src/app/(app)/study/review/summary.tsx`
- Test: `tests/app/review-session.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–5; `getEmbedder`.
- Behaviour (brief B-S4, B-S5, B-S6):
  - One card centered, large text, and a progress bar at the top ("Card 3 of 18"). The answer field is labelled "Your answer", with the buttons "Check" (Enter) and "Show answer" (flip mode, brief B2.7).
  - After Check: the student's answer next to the reference, with key points hit marked "✓ Got this" and missed ones "Missing: …", plus the feedback sentence when the LLM graded. The four rating buttons "Again", "Hard", "Good", and "Easy" show the suggestion pre-selected with the text "Suggested", and are reachable with keys 1–4. Choosing a different one is an override.
  - Grading copy while the LLM works: "Checking your answer…". On 503 or offline for a card that needs the LLM, show the self-grade buttons with "Couldn't check this one right now. How did you do?" and queue a regrade.
  - Flip mode shows the answer, and the student self-rates (`grade_source: 'self'`).
  - The summary (B-S6) shows cards reviewed, accuracy (share rated Good or Easy), time spent, and the next review time ("Next review: tomorrow, about 12 cards"). The encouraging line is "Nice work. Your next review is ready tomorrow." The summary is neutral, never guilt-based.
  - "Do more" on the summary rebuilds the session with `doMore: true`.
- Each answered card applies the rating locally (`applyRating`), updates the Dexie state, and enqueues the review. `syncOutbox` runs after the session ends and on `online`.

- [ ] **Step 1: Write the failing tests** (fake embedder, mocked `fetch` for `/api/grade`)

```ts
test('typo answer shows Good pre-selected and Suggested label, no grade request', ...);
test('why card shows Checking your answer then the LLM feedback', ...);
test('grade 503 shows self-grade prompt and queues a regrade', ...);
test('pressing 1 overrides the suggestion to Again', ...);
test('summary shows count, accuracy, and next review', ...);
test('keyboard only: Enter checks, digits rate, focus returns to the answer field', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/app/review-session.test.tsx` → module not found.

- [ ] **Step 3: Implement** to `DESIGN.md`.

- [ ] **Step 4: Run, expect PASS** — `npm test` → all passed. Run the Impeccable detector once over the review screens and fix what it reports.

- [ ] **Step 5: Commit** — `git commit -m "feat: review session with typed answers, feedback, and summary"`

---

### Task 7: Today plan and exam setup

**Files:**
- Modify: `src/app/(app)/today/page.tsx`
- Create: `src/app/(app)/study/deck/[deckId]/exam/page.tsx`, `src/app/(app)/study/deck/[deckId]/exam/actions.ts`
- Test: `tests/app/today-plan.test.tsx`, `tests/app/exam-setup.test.tsx`

**Interfaces:**
- Consumes: `buildSession`, `readiness`, `newCardCapacity` (Task 2).
- Produces: `setExamDate(deckId: string, date: string | null): Promise<{ ok: boolean; error?: string }>`. It rejects dates before today with "Pick a date from today onward."
- Today (brief B-S1, spec §8.3):
  - The primary card reads "18 cards · ~8 min" with a "Start" button to `/study/review`.
  - Exam countdowns, one per deck with a date: "Biology exam in 12 days · 74% ready".
  - When nothing is due: "You're all caught up. Next review: tomorrow, about 12 cards."
  - With no decks, keep the 1a-1 empty state.
  - The primary action is the item with the closest deadline (spec §8.3). Essay items arrive in Phase 1b.
- Exam setup (brief B-S11): a date picker and a readiness forecast. When `newCardCapacity < new cards`, show the honest workload line: "At 20 minutes a day you can start about 45 of the 80 new cards before the exam. The most important ones come first." Show "Remove exam date" when one is set.

- [ ] **Step 1: Write the failing tests**

```ts
test('Today shows due count with minutes at 25 s per card and a Start link', ...);
test('Today shows an exam countdown with readiness percent', ...);
test('Today shows all caught up when nothing is due', ...);
test('exam setup shows the capacity line when new cards exceed capacity', ...);
test('setExamDate rejects a past date', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` → failures on the new tests.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run, expect PASS** — `npm test` and `npm run test:db` → all passed; `npm run build` → succeeds.

- [ ] **Step 5: Commit** — `git commit -m "feat: Today plan with exam countdowns and exam setup"`
