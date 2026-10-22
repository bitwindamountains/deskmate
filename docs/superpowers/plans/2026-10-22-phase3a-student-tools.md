# Phase 3a: Student Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Phase 3 features that need no teacher roles:
- moving cards in and out with CSV, plus an Anki-compatible text export (B4.5);
- practice tests built from a deck (B4.4);
- timed writing practice (A4.5).

**Architecture:**
- **Import/export:** code only. The CSV parser and writer live in `src/lib/cards/csv.ts`.
- **Practice tests:** built on the device from the deck's kept cards: multiple choice with distractors taken from other cards, plus typed short answers graded by the existing local cascade. They don't touch the FSRS schedule (a test isn't a review) **[call]**. Essay prompts link to Draft Coach (2c).
- **Timed writing:** two essay columns and one prompt line. The existing checks give the feedback.

**Tech Stack:** unchanged. No new dependencies.

**Spec:** `ai-learning-platform-brief.md` A4.5, B4.4, B4.5. The teacher features of Phase 3 (A4.1–A4.4, A4.6, A4.7, B4.2) wait for the B2C vs. B2B decision (brief Part J).

## Global Constraints

- **Earlier rules still apply:** CLAUDE.md and the earlier plans' Global Constraints.
- **The timed-writing prompt line** re-runs the essay eval and adds a token-budget row.
- **CSV:**
  - RFC 4180: quoted fields, `""` escapes, CRLF or LF line endings, UTF-8 with an optional BOM.
  - The header row is `front,back` plus optional `concept` and `type` columns, matched case-insensitively.
  - At most 2,000 rows per import and 500 characters per front or back (the editor's limits).
  - Imported cards go into the chosen deck as `kept`, with `source_chunk_id = null`, `source_quote = ''`, `bloom_level = 'remember'`, `importance = 2`, and `type` either `basic` or the row's valid type.
- **Export:**
  - **CSV:** the same columns, cards in creation order.
  - **Anki text:** tab-separated `front<TAB>back` with a `#separator:tab` and `#html:false` header. Tabs and newlines inside fields become spaces.
- **Practice test:**
  - Up to 20 questions, from kept cards only.
  - Multiple choice needs 3 other cards with distinct backs, else the question becomes short answer.
  - The score reads "{n} of {m} right" with the missed cards listed. No time pressure, no streaks.
- **Timed writing:**
  - Durations of 20, 30 or 45 minutes. The timer shows minutes left as text and announces at 5 minutes and 1 minute (`role="status"`). It never auto-submits **[call]**: at zero it says "Time's up. Finish your sentence and get feedback."
  - Saved as `essays.timed_minutes` (20, 30 or 45) and `drafts.minutes_used`.
  - The global prompt (user message) gains "Written under a {n}-minute time limit; weigh structure and planning over polish." when timed.

## Review Focus

1. **A CSV exported from Excel** (BOM, CRLF, quoted commas and newlines). Expect correct cards, and a clear per-row error count for bad rows. Tested in Task 1.
2. **A deck with fewer than 4 cards.** Expect a short-answer-only test, or "Add at least 2 cards to make a test." Tested in Task 2.
3. **The timer reaching zero while the student is typing.** Expect no lost text and no auto-submit. Tested in Task 3.
4. **A timed essay re-checked as draft 2.** Expect the time note from the essay; `minutes_used` belongs to draft 1 only. Tested in Task 3.
5. **A field with a formula prefix (`=`, `+`, `-`, `@`) on export.** Expect a leading `'`, so spreadsheets don't run it (CSV injection). Tested in Task 1.

---

### Task 1: CSV import and export, Anki text export (B4.5)

**Files:** create `src/lib/cards/csv.ts`, `src/app/(app)/study/deck/[deckId]/transfer.tsx`, `src/app/api/decks/[deckId]/export/route.ts`; modify the deck page and the deck actions. **Tests:** `tests/lib/csv.test.ts`, `tests/db/card-import.test.ts`, `tests/app/deck-transfer.test.tsx`.

```ts
export function parseCards(text: string): { cards: { front: string; back: string; concept: string; type: 'basic' | 'cloze' | 'why' }[]; skipped: number; error?: string };
export function toCsv(cards: { front: string; back: string; concept: string; type: string }[]): string;
export function toAnkiText(cards: { front: string; back: string }[]): string;
export async function importCards(db: Db, userId: string, deckId: string, text: string): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }>;
// GET /api/decks/{deckId}/export?format=csv|anki → attachment, through RLS (404 for another user's deck)
```
**Tests:**
```ts
test('parseCards handles BOM, CRLF, quoted commas, quotes and newlines; skips rows without front or back and counts them', ...);
test('toCsv quotes fields and prefixes formula characters with an apostrophe', ...);
test('toAnkiText writes the header and flattens tabs and newlines', ...);
test('importCards adds kept cards to the deck and refuses another user deck', ...); // db
test('the deck page offers Import CSV, Export CSV and Export for Anki', ...);
```
**Commit:** `feat: import and export cards as CSV and Anki text`

### Task 2: Practice tests from a deck (B4.4)

**Files:** create `src/review/practice-test.ts` and `src/app/(app)/study/deck/[deckId]/test/{page.tsx, test-runner.tsx}`; add a "Practice test" link to the deck page. **Tests:** `tests/review/practice-test.test.ts`, `tests/app/practice-test.test.tsx`.

```ts
export type TestQuestion = { cardId: string; kind: 'choice' | 'short'; prompt: string; answer: string; choices?: string[] };
export function buildTest(cards: { id: string; front: string; back: string; type: string; keyPoints: string[] }[], seed: number): TestQuestion[];
```
- **Building questions:** questions are shuffled with the seed. `why` cards are always short answer.
- **Grading:** short answers use `gradeLocally` (no LLM). A `needsLlm` result is marked "Check this one yourself", with the reference answer shown, and the student marks it right or wrong.
- **Results:** shown at the end, with the missed cards and a link to "Write about this deck" (2c).

**Tests:**
```ts
test('buildTest makes choice questions with 3 distinct distractors, falls back to short answer, caps at 20, is seed-stable', ...);
test('a deck with one card says Add at least 2 cards to make a test', ...);
test('the runner scores choices and typed answers and lists the missed cards', ...);
test('a typed answer the cascade cannot settle asks the student to mark it', ...);
```
**Commit:** `feat: practice tests from a deck`

### Task 3: Timed writing practice (A4.5)

**Files:** migration `supabase/migrations/20261022160000_scholar_timed_writing.sql` (the owner sees it before it's applied). Modify `new-essay-form.tsx`, `create-essay.ts`, `analyze.ts`, `prompts.ts` (`EssayInput.timedMinutes`), and the essay view. Create `src/app/(app)/write/new/timer.tsx`. **Tests:** `tests/db/essay-actions.test.ts`, `tests/app/write.test.tsx`, `tests/llm/essay-prompts.test.ts`, `tests/db/essay-analyze.test.ts`.

**Migration:**
- `essays.timed_minutes smallint check (timed_minutes in (20, 30, 45))`, nullable;
- `drafts.minutes_used smallint check (minutes_used between 0 and 600)`, nullable;
- the drafts insert grant gains `minutes_used`.

**UI:**
- The form gets a "Timed practice" select (Off, 20, 30 or 45 minutes) and a Start button. The timer is shown in text, and "Time's up…" appears at zero; the editor stays editable.
- The essay view shows "Timed: wrote it in {m} of {n} minutes" when timed.

**Tests:**
```ts
test('global prompt adds the time-limit line only for timed essays, in the user message', ...);
test('createEssay saves timed_minutes and minutes_used; invalid durations are rejected', ...); // db
test('the timer counts down, announces at 5 and 1 minutes, and at zero shows Time\'s up without submitting', ...);
test('the analyze layer passes timed minutes from the essay on draft 2 as well', ...); // db
```
**Eval:** re-run the essays with one sample timed at 30 minutes. Gate: the feedback mentions structure or planning, and input tokens grow by at most 20.

**Commit:** `feat: timed writing practice`
