# Phase 2c: Growth and Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two tools feed each other.
- A student sees their recurring writing patterns and how each is trending.
- They can turn a pattern into practice cards with one click.
- They can turn a deck, or a "why" card they just missed, into a short writing task.
- One Progress page shows their whole learner profile, including one calibration score across both tools.

**Architecture:** All code, no LLM calls and no migration.
- **Patterns:** the growth profile classifies each first-draft feedback item into a fixed pattern list using deterministic rules.
- **Practice cards:** come from a hand-written template bank (spec §8.3) and are inserted into a "Writing practice" deck through the student's own RLS client.
- **Writing tasks:** essay prompts from cards are plain templates. They open the existing new-essay form prefilled, so Draft Coach checks them as usual.

**Tech Stack:** unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§8.3), plus the overview `docs/superpowers/plans/2026-10-21-phase2-overview.md`. Brief: A3.5, C1, C2, C3 (Progress tab).

**Depends on:**
- 1a: `decks`, `cards` (`source_chunk_id` may be null), `card_states`, `reviews`.
- 1b: `feedback_items`, `drafts`, the new-essay form, `MIN_WORDS = 50`.
- 2a: `calibration()` in `src/review/calibration.ts`, `LEECH_LAPSES = 4`, the deck page.
- 2b:
  - `self_assessments`, `compareSelf()` in `src/lib/essay/self-check.ts`;
  - the `withdrawn` status;
  - `highest_level` (1–5) on feedback items.

## Global Constraints

- **Earlier rules still apply:** `CLAUDE.md`, the earlier plans' Global Constraints, and the token-budget note. This phase adds no LLM call and no prompt change, so it needs no eval row.
- **Growth profile scope:**
  - Built only from **version-1 drafts**, because later drafts are revisions of the same habits.
  - **Withdrawn items are excluded**, since the coach took them back.
  - Counts are per 1,000 words of each first draft, so long and short essays compare fairly.
- **Recurring:** a pattern seen in at least 2 essays.
- **Trend:**
  - Compares the first essay's rate with the latest essay's rate, shown only once there are 2 or more essays and the first rate is above 0.
  - Copy: "Down 60% since your first essay", "Up 20% since your first essay", or "About the same as your first essay" (within ±10%).
  - Never guilt framing (CLAUDE.md): no red "worse" language, and an increase reads as a neutral fact.
- **Template bank:**
  - 3–5 hand-written cards for each pattern that has one. Each card's `concept` is the pattern key and its `source_quote` is the card's own example sentence.
  - Card fields: `bloom_level: 'apply'`, `importance: 2`, `status: 'kept'`, `source_chunk_id: null`.
- **Practice deck:**
  - One per student, found by `subject = 'writing-practice'` and titled "Writing practice". Created on first use.
  - Adding a pattern already in the deck adds nothing: "Already in your Writing practice deck."
- **Essay prompts:** "Explain in one paragraph (at least 50 words): {front}" for a `why` card. For a deck with no `why` cards: "Explain in one paragraph (at least 50 words) how {concept} works, using what you studied." At most 3 prompts per deck.
- **Shared calibration:**
  - Recall part: `calibration()` (needs 10 rated answers).
  - Writing part: the share of criteria within one point across all self-assessed drafts that have scores (needs 3 or more compared criteria).
  - Combined: shown only when both parts exist. It's their mean weighted by their counts, rounded to a whole percent.
- **Nav:** a fifth item, "Progress" at `/progress`, between Write and Profile **[call]**. The Profile page's self-check row moves to Progress.

## Review Focus

1. **A student with no essays, or only one.** Expect the empty-state copy and no trend line, with no division by zero. Tested in Task 1.
2. **A free-form LLM category the rules don't recognize** ("Overall flow"). Expect it to be ignored, never shown as a pattern called "Other". Tested in Task 1.
3. **"Practice this" clicked twice, or on a slow connection.** Expect the deck to get the cards once, with the second click showing the already-added note. Tested in Task 2.
4. **A deck where every card is basic, or an empty deck.** Expect concept prompts in the first case and no prompt section in the second. Tested in Task 3.
5. **Calibration with only one tool's data.** Expect that part alone, labelled, with no combined line pretending to cover both tools. Tested in Task 4.

---

### Task 1: Growth profile (A3.5)

**Files:**
- Create: `src/growth/patterns.ts`, `src/growth/profile.ts`, `src/lib/growth/load.ts`
- Test: `tests/growth/patterns.test.ts`, `tests/growth/profile.test.ts`, `tests/db/growth.test.ts`

**Interfaces:**
```ts
export const PATTERNS: Record<PatternKey, string>; // key → label, in display order
export type PatternKey = 'vague_thesis' | 'weak_topic_sentence' | 'unsupported_claim' | 'missing_analysis' | 'weak_transitions'
  | 'over_quoting' | 'citation' | 'comma_splice' | 'run_on' | 'spelling' | 'grammar' | 'punctuation';
export function patternOf(item: { layer: string; category: string; summary: string; rubric_criterion: string | null; source: string }): PatternKey | null;
export type EssayItems = { essayId: string; title: string; createdAt: string; words: number; patterns: PatternKey[] };
export type PatternStat = { key: PatternKey; label: string; essays: number; latestRate: number; trend: number | null };
export function growthProfile(essays: EssayItems[]): { recurring: PatternStat[]; essays: number };
export async function loadGrowth(db: Db): Promise<EssayItems[]>; // version-1 drafts, items not withdrawn, oldest essay first
```
- **`patternOf` rules, first match wins:**
  1. **LanguageTool items:** `TYPOS` → spelling; `GRAMMAR` and `CONFUSED_WORDS` → grammar; `PUNCTUATION` → punctuation; `REDUNDANCY` → null.
  2. **Text rules on `category + ' ' + summary`, lowercased:**
     - `comma splice` → comma_splice;
     - `run-on|run on|fused sentence` → run_on;
     - `topic sentence` → weak_topic_sentence;
     - `over-?quot|too many quot|long quot` → over_quoting;
     - `citation|cite|source format` → citation;
     - `transition` → weak_transitions.
  3. **Rubric criterion:** Thesis → vague_thesis, Evidence → unsupported_claim, Analysis → missing_analysis.
  4. **Otherwise:** null.
- **`trend`:** `(latest − first) / first`, or null when there's 1 essay or the first rate is 0.
- **Sorting:** `recurring` is sorted by number of essays, then by latest rate.

- [ ] **Step 1: Write the failing tests**
```ts
test('patternOf maps LanguageTool categories, text rules before rubric fallbacks, and unknown categories to null', ...);
// e.g. {category:'Evidence', summary:'This is a comma splice', rubric:'Evidence'} → 'comma_splice'; {category:'Overall flow', rubric:null} → null
test('growthProfile counts per 1000 words, keeps patterns seen in 2+ essays, and computes the trend first→latest', ...);
test('growthProfile with 0 or 1 essays has no recurring patterns and no trend', ...);
test('loadGrowth reads only version-1 drafts and skips withdrawn items; another user sees nothing', ...); // db
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: growth profile of recurring writing patterns`

---

### Task 2: Essay → practice cards from the template bank (C1)

**Files:**
- Create: `src/growth/templates.ts`, `src/lib/growth/practice.ts`, `src/app/(app)/progress/actions.ts`
- Test: `tests/growth/templates.test.ts`, `tests/db/growth-practice.test.ts`

**Interfaces:**
```ts
export type TemplateCard = { type: 'basic' | 'cloze' | 'why'; front: string; back: string; key_points: string[]; example: string };
export const TEMPLATES: Partial<Record<PatternKey, TemplateCard[]>>; // 3–5 each, for every pattern except spelling, grammar, punctuation
export async function addPractice(db: Db, userId: string, pattern: PatternKey):
  Promise<{ ok: true; deckId: string; added: number } | { ok: false; message: string }>;
export async function practicePattern(pattern: string): Promise<{ ok: true; deckId: string; added: number } | { ok: false; message: string }>; // server action
```
- **The bank:** hand-written, about general writing and never about any student's essay.
  - **Example card (comma_splice):**
    - front: "Is this a comma splice? 'The bell rang, everyone left.'";
    - back: "Yes. Two full sentences are joined by only a comma. Use a period, a semicolon, or a joining word like 'so'.";
    - example: "The bell rang, everyone left."
- **`addPractice`:**
  1. Finds or creates the "Writing practice" deck.
  2. If the deck already has cards with `concept = pattern`, returns `added: 0`.
  3. Otherwise inserts the pattern's templates as kept cards.
- **The server action** validates `pattern` against `PATTERNS`, then calls `addPractice`. Copy:
  - "Added {n} practice cards to Writing practice.";
  - "Already in your Writing practice deck.";
  - on failure, "We couldn't add those cards. Try again."

- [ ] **Step 1: Write the failing tests**
```ts
test('every template pattern has 3–5 cards; fronts are unique; no pattern outside PATTERNS', ...);
test('addPractice creates the Writing practice deck once and adds the pattern cards as kept', ...); // db
test('adding the same pattern twice adds nothing the second time', ...); // db
test('practicePattern rejects an unknown pattern without touching the database', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: practice cards for recurring writing patterns`

---

### Task 3: Flashcards → essay prompts (C1)

**Files:**
- Create: `src/growth/prompts.ts`
- Modify:
  - `src/app/(app)/study/deck/[deckId]/page.tsx` ("Write about this deck")
  - `src/app/(app)/write/new/page.tsx` and `new-essay-form.tsx` (prefill from `?title=&prompt=`)
  - `src/app/(app)/study/review/session.tsx` (escalation link)
- Test: `tests/growth/prompts.test.ts`, `tests/app/write.test.tsx` (extend), `tests/app/review-session.test.tsx` (extend), `tests/app/card-list.test.tsx` or a new deck-page test

**Interfaces:**
```ts
export function essayPrompts(cards: { type: string; front: string; concept: string }[]): string[]; // ≤ 3, why cards first, else distinct concepts
export function writeHref(title: string, prompt: string): string; // `/write/new?title=…&prompt=…`, URL-encoded
```
- **Deck page:** a section "Write about this deck", listing up to 3 prompts as links. It's absent when `essayPrompts` returns `[]`.
- **New-essay form:**
  - Reads `title` and `prompt`, each trimmed and cut to the column limits (120 and 4,000).
  - Prefills both, opens Assignment details, and sets the essay type to expository.
- **Review session:** after a `why` card is rated Again or Hard, a link "Explain it in writing" points to `writeHref(front, prompt)`.

- [ ] **Step 1: Write the failing tests**
```ts
test('essayPrompts uses why cards first, falls back to distinct concepts, caps at 3, and is empty for no cards', ...);
test('the new-essay form prefills title and prompt from the URL and opens assignment details', ...);
test('a why card rated Again shows Explain it in writing with the prefilled link; a basic card does not', ...);
test('the deck page lists Write about this deck prompts and hides the section for an empty deck', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test`.
- [ ] **Step 5: Commit:** `feat: essay prompts from flashcards`

---

### Task 4: Learner profile and shared calibration (C2, C3)

**Files:**
- Create: `src/growth/learner.ts`, `src/app/(app)/progress/page.tsx`, `src/app/(app)/progress/growth-list.tsx`
- Modify: `src/components/nav.tsx`, `src/app/(app)/profile/page.tsx`
- Test: `tests/growth/learner.test.ts`, `tests/app/progress.test.tsx`, `tests/app/nav.test.tsx` (extend)

**Interfaces:**
```ts
export function sharedCalibration(recall: { score: number; n: number } | null, writing: { within: number; of: number } | null):
  { recall: number | null; writing: number | null; combined: number | null }; // combined only when both parts exist
export function hintReliance(levels: number[]): number | null;        // mean highest_level over items opened (level ≥ 1), 1 decimal
export function leechRate(lapses: number[]): number | null;           // share of kept cards with lapses ≥ 4, whole percent
```
- **Progress page sections:**
  1. **"Writing patterns":** the growth list, each pattern with its trend copy and a "Practice this" button wired to Task 2's action. A pattern without templates shows no button.
  2. **"Self-check accuracy":** the recall, writing and combined lines, each with its count ("from N answers", "from N criteria").
  3. **"Habits":** "Deepest hint you usually open: N of 5" and "Cards that keep slipping: N%".
  4. **A link to the mastery map.**
- **Empty states:**
  - With no first-draft essays: "Check an essay to see your writing patterns."
  - With essays but no recurring patterns: "No pattern has come up in two essays yet."
- **Nav:** gains Progress. **Profile** drops the self-check row and gets a link "See your progress".

- [ ] **Step 1: Write the failing tests**
```ts
test('sharedCalibration weights by counts and leaves combined null when one part is missing', ...);
test('hintReliance and leechRate handle empty input as null', ...);
test('Progress shows patterns with trend copy and Practice this, the calibration lines, and empty states', ...);
test('nav has Progress between Write and Profile and marks it current on /progress', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md.
- [ ] **Step 4: Run, expect PASS:** `npm test`, then `npm run build`.
- [ ] **Step 5: Commit:** `feat: progress page with one learner profile and shared calibration`

---

## Out of scope for 2c

- **Assigned to 2d in the overview, as LLM-backed features:**
  - vocabulary cards from misused words;
  - research-fact cards from cited sources.
- **Calls made here:**
  - a stored learner-profile table (computed on load instead);
  - patterns from revised drafts;
  - notification time and feedback-tone preferences (C2 lists them; they need a settings pass of their own).
