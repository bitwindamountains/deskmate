# Phase 1b: Draft Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user pastes or uploads an essay and gets prioritized feedback with hints that reveal one level at a time. Feedback arrives in three layers: global, paragraph, then sentence. The user revises in the app, re-checks, and sees which earlier items they addressed.

**Architecture:**
- **Storage.** An essay has numbered drafts. Each draft has one analysis (rubric scores, strengths, a safety flag) and its feedback items.
- **Analysis runs one layer at a time.** The essay page calls `POST /api/essays/analyze` once per layer (`global`, then `paragraphs`, then `sentences`) and renders each result as it arrives. This is the 1a-2 generation pattern, with no job queue.
- **Each layer is idempotent per draft.** The daily quota is charged once per draft, whichever layer runs first.
- **Where each layer comes from.** Global and paragraph feedback come from the Phase 0 router (Groq only for real essays). Sentence feedback comes from the free LanguageTool API, with no LLM.
- **Computed in code, not by the LLM.** Ranks come from `rankFeedback`. Anchors come from `findAnchor`; any item the code can't anchor is dropped.
- **Hint levels 3–5 are generated only when asked** (`POST /api/essays/hint`). Level-5 rewrites are capped per draft by a security-definer function.
- **Re-check carries feedback over.**
  - Items in unchanged paragraphs (same content hash) copy across as they are.
  - The global pass judges the rest: addressed, partial or open.
  - Only changed paragraphs are re-analyzed.

**Tech Stack:**
- The stack from plans 1a-1 to 1a-3.
- New dependencies:
  - `mammoth`: DOCX to text, in the browser.
  - `diff`: word diff for draft compare.
  - Pin both exactly, to a release at least 2 weeks old (`npm i -E`).
- LanguageTool public API: `https://api.languagetool.org/v2/check`. It's free and needs no key.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§5, §6.1, §6.2, §6.5, §7 item 3, §8.1, §8.3, §9, §11). Brief: A2.1–A2.9, A-S1–A-S4, A-S6, A5.2–A5.5, A7, D3.1, D3.4, D4, E2, E3, E5.

**Depends on:**
- Phase 0: `complete`, `essayGlobalPrompt`, `essayParagraphsPrompt`, `FeedbackItem`, `EssayGlobal`, `rankFeedback`, `findAnchor`, `numberParagraphs`.
- Plans 1a-1 to 1a-3:
  - The shell and `requireOnboardedUser`.
  - `quota_usage.essays`, `llm_calls`, and `logCalls` plus the `Db` type from `src/lib/llm-calls.ts`.
  - The PDF extraction from 1a-2.
  - `loadStudy` and the `TodayPlan` component.

## Global Constraints

- Everything in the Global Constraints of plans 1a-1, 1a-2 and 1a-3 applies, including the `CLAUDE.md` hard rules. In particular: schemas `scholar` and `scholar_private` only, hand-written migrations, and the owner sees each migration before it's applied.
- **Inputs:**
  - Paste, `.pdf` (text layer only, the 1a-2 extractor), `.docx`, or typing into the editor.
  - Only extracted text is stored, never the file (spec §9).
- **Length:**
  - 50 to 2,000 words per draft **[call]**. The spec chunks the paragraph pass above 2,000 words; 1b refuses longer essays instead.
  - At most 40 paragraphs.
- **Essay context:**
  - Title, plus an optional assignment prompt (≤ 4,000 characters).
  - Essay type, one of: `argumentative`, `expository`, `narrative`, `compare-contrast`, `research`, `personal-statement`.
  - Grade level, default `college`.
  - Optional citation style.
- **Rubric:** every essay uses Phase 0's `DEFAULT_RUBRIC` **[call]**. Custom rubrics come with the Phase 3 rubric builder.
- **Quota:**
  - 5 essay checks per user per UTC day (spec §6.5).
  - One check is one draft analysed. Retries and later layers of the same draft are free.
  - Hint levels 3–4 don't count against it.
- **Rewrites:** at most 3 level-5 rewrites per draft (brief A2.5). A rewrite covers the item's quote only.
- **No ghostwriting:**
  - Prompts never return a rewritten essay or paragraph.
  - A rewrite longer than `max(25, 1.5 × quote word count)` words is discarded and reported as unavailable.
- **Privacy:**
  - Essay text never appears in logs or `console` output. `llm_calls` stays metadata only.
  - Real essays use `requireNoTraining: true` (the router default).
- **Ranking:** `rankFeedback` with rubric weight 1 for every criterion. Top 3 means `priority_rank <= 3` among items whose status is `open` or `partial`.
- **Dialect fairness (E3):**
  - Sentence feedback keeps only LanguageTool categories `TYPOS`, `GRAMMAR`, `PUNCTUATION`, `CONFUSED_WORDS` and `REDUNDANCY` **[call]**.
  - Items in `PUNCTUATION` and `REDUNDANCY` are labelled "Academic convention", never "error".
- **Copy:** follows brief A5.3. Warm, specific, never about the student as a person, and no guilt.
- **Layer labels:**
  - Each layer's highlight shows a text label as well as a colour, so colour is never the only signal.
  - Labels: Big picture (global), Paragraph, Sentence, Strength.
  - Colours are tokens added to `globals.css` and checked at ≥ 4.5:1 in both themes, following DESIGN.md.
- **Accessibility:** WCAG 2.2 AA. Every action works with the keyboard alone. Clicking a highlight moves focus to its feedback card, and the card's "Show in essay" moves focus back to the highlight.

## Review Focus

1. **The model quotes words that aren't in the essay.** Expect the item dropped and counted in `dropped`, never saved with a guessed anchor. Tested in Task 5.
2. **A layer fails with a 503, then the user retries.** Expect no second quota charge, and layers that already finished are not re-run. Tested in Task 5.
3. **On re-check, the student has deleted the paragraph an open item pointed to, and the global pass leaves that item out of `carried`.** Expect it carried as `open` with no anchor, shown as a whole-essay item. It must never be lost silently. Tested in Task 3.
4. **User A posts B's `draftId` to analyze, or B's `itemId` to hint.** Expect 404 and no LLM call. Tested in Tasks 5 and 6.
5. **A fourth rewrite request on one draft, or two sent at once when one is left.** Expect exactly 3 rewrites granted, then "You've used this draft's 3 suggested rewrites." with no LLM call. Tested in Task 6.

---

### Task 1: Essay quality gate on real providers

Phase 0's eval runs never reached a real provider (every essay call was `skipped_no_key` or `error`), so no one has seen free-model essay feedback yet (spec §11, risk 1).

**Files:**
- Create: `docs/superpowers/notes/2026-10-21-essay-eval.md`

- [ ] **Step 1:** With `GROQ_API_KEY` set in `.env`, run `npm run eval -- --provider groq`.
  - Expected: `eval/out/<timestamp>/essay/*.json` has non-empty `items` and `strengths` for every sample.
  - Expected: `summary.csv` shows `ok` rows for `essay_global` and `essay_paragraphs`.
- [ ] **Step 2:** The owner rates 5 essay outputs.
  - Score each on: specific, anchored, kind, no rewriting. Record the scores in the notes file.
  - Gate: at least 4 of 5 essays have a useful Top 3. Below that, stop and revise the prompts in `src/llm/prompts.ts` before Task 4. Re-run the eval after any prompt or model change (spec J10).
- [ ] **Step 3: Commit:** `git commit -m "docs: essay eval results on groq"`

---

### Task 2: Essay tables, quota, and rewrite cap

**Files:**
- Create: `supabase/migrations/20261021120000_scholar_essays.sql`, written by hand. The owner reviews it before it's applied.
- Test: `tests/db/essays.test.ts`

**Interfaces:**
- **Tables:** all in `scholar`. Each has `id uuid pk default gen_random_uuid()` (except `analyses`), `user_id`, `created_at`, and RLS with owner policies as in 1a-2. Each starts with `revoke all ... from public, anon, authenticated`, then the grants below, plus `grant all ... to service_role`. Every child table's insert `with check` verifies the parent row belongs to the user.

| table | columns | grants to `authenticated` |
|---|---|---|
| `essays` | `title text not null check (char_length(title) between 1 and 120)`, `essay_type text not null check (in the six types)`, `grade_level text not null default 'college'`, `assignment_prompt text check (char_length ≤ 4000)`, `citation_style text`, `updated_at timestamptz not null default now()` | select, insert, delete, update (`title, essay_type, grade_level, assignment_prompt, citation_style, updated_at`) |
| `drafts` | `essay_id uuid not null references essays on delete cascade`, `version smallint not null check (version ≥ 1)`, `content text not null check (char_length ≤ 20000)`, `word_count int not null`, `paragraph_hashes text[] not null`, `layers jsonb not null default '{}'`, `quota_consumed_at timestamptz`, `unique (essay_id, version)` | select; insert (`id, user_id, essay_id, version, content, word_count, paragraph_hashes`); update (`layers`) |
| `analyses` | `draft_id uuid primary key references drafts on delete cascade`, `rubric_scores jsonb not null`, `strengths jsonb not null`, `safety_concern boolean not null default false` | select, insert |
| `feedback_items` | `draft_id uuid not null references drafts on delete cascade`, `layer text check (in global, paragraph, sentence)`, `category text not null`, `rubric_criterion text`, `paragraph_index smallint`, `quote text`, `anchor_start int`, `anchor_end int`, `severity text check (in low, medium, high)`, `summary text not null`, `hints text[] not null default '{}'` (index = level − 1, levels 1–4), `rewrite text`, `replacements text[] not null default '{}'`, `convention boolean not null default false`, `source text check (in llm, languagetool)`, `status text not null default 'open' check (in open, partial, addressed, got_it, disputed)`, `dispute_reason text check (char_length ≤ 1000)`, `highest_level smallint not null default 0`, `carried_from_id uuid references feedback_items on delete set null` | select, insert; update (`status, dispute_reason, highest_level, hints, rewrite`) |
| `feedback_events` | `item_id uuid not null references feedback_items on delete cascade`, `action text check (in viewed_level, got_it, disagree, rewrite)`, `level smallint` | select; insert with `with check (action <> 'rewrite')` |

- **Indexes:** `user_id` on every table; `drafts (essay_id, version)` comes from the unique constraint; `feedback_items (draft_id)`; `feedback_events (item_id)`.
- **`scholar_private.consume_essay_quota(p_draft_id uuid) returns boolean`**
  - `security definer`, `set search_path = ''`, owner check.
  - Returns true if `quota_consumed_at` is already set.
  - Otherwise increments today's `quota_usage.essays` while `< 5`, sets `quota_consumed_at` and returns true. At the limit it returns false.
  - It copies the shape of `consume_generation_quota`, with a `scholar.consume_essay_quota` invoker wrapper.
- **`scholar_private.reserve_rewrite(p_item_id uuid) returns boolean`**
  - `security definer`, owner check.
  - Locks the item's draft row (`for update`) so two parallel calls can't both see 2 rewrites.
  - Counts `rewrite` events across that draft's items. If the count is under 3, it inserts a `rewrite` event and returns true; otherwise it returns false.
  - Has a `scholar.reserve_rewrite` invoker wrapper.

- [ ] **Step 1: Write the failing tests** (they reuse `tests/db/helpers.ts`)

```ts
test('user B cannot read or insert into user A essay, drafts, or items', ...);
test('draft version is unique per essay', ...);
test('consume_essay_quota: same draft twice charges once; sixth draft of the day is false', ...);
test('reserve_rewrite: three true then false; two parallel calls with one left give exactly one true', ...);
test('direct insert of a rewrite event is denied', ...);
test('user cannot update drafts.content or analyses after insert', ...);
```

- [ ] **Step 2: Run, expect FAIL:** `npm run test:db -- tests/db/essays.test.ts` fails because the relations don't exist yet.
- [ ] **Step 3:** Write the migration and show it to the owner. Apply it after approval, then run the security and performance advisors.
- [ ] **Step 4: Run, expect PASS:** `npm run test:db` passes in full, and the advisors show nothing new for `scholar`.
- [ ] **Step 5: Commit:** `git commit -m "feat: essay tables, essay quota, rewrite cap"`

---

### Task 3: Essay text, anchors, and carry-over planning

**Files:**
- Create: `src/lib/essay/text.ts`, `src/lib/essay/carry.ts`
- Test: `tests/lib/essay-text.test.ts`, `tests/lib/essay-carry.test.ts`

**Interfaces:**
```ts
// text.ts
export const ESSAY_TYPES = ['argumentative', 'expository', 'narrative', 'compare-contrast', 'research', 'personal-statement'] as const;
export type EssayType = (typeof ESSAY_TYPES)[number];
export const MIN_WORDS = 50, MAX_WORDS = 2000, MAX_PARAGRAPHS = 40;
export function paragraphs(content: string): string[];               // numberParagraphs from src/llm/prompts.ts
export async function paragraphHash(p: string): Promise<string>;     // SHA-256 hex of normalizeText(p), via crypto.subtle
export function validateEssay(content: string): { ok: true; words: number } | { ok: false; error: string };
export type Anchor = { paragraph_index: number; start: number; end: number };
export function anchorQuote(paras: string[], hintIndex: number, quote: string): Anchor | null;
//   findAnchor in paras[hintIndex] first, then in every other paragraph in order; null when not found anywhere.
// carry.ts
export type PrevItem = { id: string; layer: 'global' | 'paragraph' | 'sentence'; paragraph_index: number | null; quote: string | null;
  summary: string; status: 'open' | 'partial' | 'addressed' | 'got_it' | 'disputed' };
export type CarryPlan = { keep: { id: string; paragraph_index: number }[]; judge: PrevItem[]; changed: number[] };
export function planCarryOver(oldHashes: string[], newHashes: string[], prev: PrevItem[]): CarryPlan;
export function applyJudgement(plan: CarryPlan, carried: { id: string; status: 'addressed' | 'partial' | 'open' }[]):
  { id: string; status: 'addressed' | 'partial' | 'open' }[];
```
- **`planCarryOver` rules:**
  - Items with status `addressed` are dropped.
  - A paragraph or sentence item whose paragraph hash appears in `newHashes` goes in `keep`, with its new index (the first match).
  - Every other item, including all global items, goes in `judge`.
  - `changed` lists the new paragraph indices whose hash wasn't in `oldHashes`.
- **`applyJudgement`** returns one status for every judged item. An item the model left out gets `open` (Review Focus 3).
- **Departure from spec §8.1 [call]:** paragraphs are matched by content hash, not paragraph embeddings. Edited paragraphs fall through to the global pass's judgement, which the spec already relies on. The embedder is browser-only, and this avoids running it on the server.
- **Validation messages:**
  - "Add a little more: feedback needs at least 50 words."
  - "This essay is {n} words. Draft Coach handles up to 2,000 words for now; paste one section at a time."
  - "That's a lot of paragraphs. Join short ones and try again."

- [ ] **Step 1: Write the failing tests**

```ts
test('validateEssay: 49 words fails with the 50-word message; 2,001 words names the count', ...);
test('anchorQuote finds the quote in another paragraph when the model gives the wrong index', ...);
test('anchorQuote returns null for words not in the essay', ...);
test('paragraphHash ignores whitespace and curly-quote differences', ...);
test('unchanged paragraph moved from index 2 to 3 keeps its items with paragraph_index 3', ...);
test('edited paragraph sends its items to judge and lists its index in changed', ...);
test('addressed items are not carried', ...);
test('an item the model omits from carried comes back open', ...);
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run tests/lib/essay-text.test.ts tests/lib/essay-carry.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit:** `git commit -m "feat: essay paragraphs, anchors, and carry-over plan"`

---

### Task 4: Prompts, schemas, router tasks, and the LanguageTool client

**Files:**
- Modify: `src/llm/schemas.ts`, `src/llm/prompts.ts`, `src/llm/types.ts`, `src/llm/config.ts`
- Create: `src/lib/essay/languagetool.ts`
- Test: `tests/llm/essay-prompts.test.ts`, `tests/lib/languagetool.test.ts`

**Interfaces:**
- **`EssayGlobal` gains two fields:**
  - `safety_concern: z.boolean()`: true when the essay discloses self-harm, abuse, or crisis (brief E5).
  - `carried: z.array(z.object({ id: z.string(), status: z.enum(['addressed', 'partial', 'open']) })).default([])`.
  - The Phase 0 eval keeps working, because `carried` defaults to an empty list.
- **`EssayInput` gains two optional fields:**
  - `previousItems?: { id: string; summary: string; quote: string | null }[]`
  - `onlyParagraphs?: number[]`
- **Prompt changes:**
  - `essayGlobalPrompt` adds, when `previousItems` is set: "Earlier feedback items are listed below. For each, judge against this draft whether it is addressed, partial, or still open, and return it in carried." The list goes in `wrapData('previous_feedback', …)`.
  - It always adds the safety instruction: "If the essay discloses self-harm, abuse, or a crisis, set safety_concern true. Never diagnose."
  - `essayParagraphsPrompt` with `onlyParagraphs` adds: "Report only on paragraphs [P…]; the rest are shown for context."
- **New router tasks** `hint_ladder` and `hint_rewrite`, added to `TaskName` and `TASK_ROUTES` with the same order as `essay_global`.
- **New schemas:**
  - `HintLadder = { explanation: string; example: string }`: level 3 is one principle in ≤ 60 words; level 4 is a model example on **different** content in ≤ 120 words.
  - `HintRewrite = { rewrite: string }`.
- **New prompts:** `hintLadderPrompt(i: { gradeLevel; item: { summary; quote; category }; paragraph: string })` and `hintRewritePrompt(…)`, with the same input fields. Both wrap the essay text with `wrapData` and include `DATA_RULE`. The rewrite prompt says: "Rewrite only the quoted words, keeping the student's voice and meaning. Never rewrite anything else."
- **The LanguageTool client:**
```ts
export type SentenceItem = { paragraph_index: number; quote: string; start: number; end: number; category: string;
  summary: string; replacements: string[]; convention: boolean };
export async function checkSentences(paras: string[], indices: number[], fetchFn?: typeof fetch): Promise<SentenceItem[]>;
```
  - **Request:** one form-encoded POST per call, with `language=en-US` and `level=default`. The text is the selected paragraphs joined by `\n\n`, and offsets are mapped back to each paragraph.
  - **Filtering:** only the allow-listed categories are kept. `quote` is the matched span, and `replacements` is the first 3 values.
  - **Failures:** a non-2xx response or a network error throws `LanguageToolUnavailable`.
  - **Rate limit:** a `ponytail:` comment notes the public API allows about 20 requests a minute, shared by every user, and to self-host LanguageTool if `llm_calls`-style logs show 429s.

- [ ] **Step 1: Write the failing tests**

```ts
test('essayGlobalPrompt lists previous items inside previous_feedback tags', ...);
test('essayParagraphsPrompt with onlyParagraphs names them', ...);
test('EssayGlobal requires safety_concern and defaults carried to []', ...);
test('hint prompts wrap the essay paragraph and forbid rewriting beyond the quote', ...);
test('checkSentences maps offsets back to the right paragraph', ...);          // mocked fetch, matches in P0 and P2
test('checkSentences drops STYLE matches and labels PUNCTUATION as convention', ...);
test('checkSentences throws LanguageToolUnavailable on 429', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** `npm test` passes in full, including the Phase 0 tests.
- [ ] **Step 5: Commit:** `git commit -m "feat: essay prompts for carry-over and safety, hint tasks, LanguageTool client"`

---

### Task 5: Layer analysis route

**Files:**
- Create: `src/lib/essay/analyze.ts`, `src/app/api/essays/analyze/route.ts`
- Test: `tests/db/essay-analyze.test.ts`

**Interfaces:**
```ts
export type Layer = 'global' | 'paragraphs' | 'sentences';
export type ItemRow = { id: string; layer: 'global' | 'paragraph' | 'sentence'; category: string; rubric_criterion: string | null;
  paragraph_index: number | null; quote: string | null; anchor_start: number | null; anchor_end: number | null;
  severity: 'low' | 'medium' | 'high'; summary: string; hints: string[]; rewrite: string | null; replacements: string[];
  convention: boolean; source: 'llm' | 'languagetool'; status: string; highest_level: number; carried_from_id: string | null };
export type AnalyzeResult =
  | { ok: true; items: ItemRow[]; analysis?: { rubric_scores: unknown; strengths: unknown; safety_concern: boolean }; dropped: number; already: boolean }
  | { ok: false; status: 404 | 409 | 429 | 503; error: 'not_found' | 'running' | 'quota' | 'busy'; message: string };
export async function analyzeLayer(db: Db, userId: string, draftId: string, layer: Layer,
  env: Record<string, string | undefined>, deps?: { completeFn?: typeof complete; fetchFn?: typeof fetch }): Promise<AnalyzeResult>;
export async function POST(req: NextRequest): Promise<NextResponse>;   // body { draftId: uuid, layer }; 400/401/403 as in /api/generate
```
- **Flow for each layer:**
  1. Load the draft through RLS (404 if missing).
  2. If `layers[layer] === 'done'`, return that layer's saved items with `already: true` and make no call.
  3. Claim the layer with a conditional update: set `layers[layer] = 'running'` only while it is null or `'failed'`. If no row updates, return 409 `running`.
  4. Call `consume_essay_quota`. A `false` sets the layer back to null and returns 429 with "You've used today's 5 essay checks. They reset at midnight UTC."
  5. **Draft 1:** analyse everything.
  6. **Later drafts:** load the previous version's items and build `planCarryOver`.
     - `global` passes `plan.judge` as `previousItems`. It then updates each old item's status from `applyJudgement`, and copies the judged `open`/`partial` items into this draft (anchor from `anchorQuote`, or null) with `carried_from_id` set.
     - `paragraphs` and `sentences` copy their `keep` items, then analyse only `plan.changed`. If that list is empty, they make no call.
  7. Anchor every item, and every strength, with `anchorQuote`. Drop any that can't be anchored and count them in `dropped`.
  8. Insert the items and the `analyses` row (global only), then set `layers[layer] = 'done'`.
- **Failures:** on any failure, set the layer to `'failed'` and return 503 `busy` with "Feedback is busy right now. Your essay is saved; try again in a minute." `logCalls` records every LLM attempt.

- [ ] **Step 1: Write the failing tests** (fake `completeFn` and `fetchFn`, as in `generate-route.test.ts`)

```ts
test('global layer stores scores, anchored strengths and items; drops the unanchorable quote and counts it', ...);
test('second call for a done layer returns saved items with no LLM call', ...);
test('busy then retry charges quota once and does not rerun the finished global layer', ...);
test('sixth draft of the day is 429 with the quota message and no LLM call', ...);
test('another user draft is 404 with no LLM call', ...);
test('sentences layer saves LanguageTool items with convention flags; LanguageTool down is 503 for that layer only', ...);
test('draft 2: unchanged paragraph items are copied, changed paragraphs alone are sent, omitted judged items stay open', ...);
test('POST with an unknown layer is 400; without a session is 401', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm run test:db` passes in full.
- [ ] **Step 5: Commit:** `git commit -m "feat: layered essay analysis route with carry-over"`

---

### Task 6: Hint route

**Files:**
- Create: `src/lib/essay/hints.ts`, `src/app/api/essays/hint/route.ts`
- Test: `tests/db/essay-hint.test.ts`

**Interfaces:**
```ts
export async function requestHint(db: Db, userId: string, itemId: string, level: 3 | 4 | 5,
  env: Record<string, string | undefined>, completeFn?: typeof complete):
  Promise<{ ok: true; text: string } | { ok: false; status: 404 | 409 | 429 | 503; message: string }>;
export async function POST(req: NextRequest): Promise<NextResponse>;   // body { itemId: uuid, level: 3 | 4 | 5 }
```
- **Levels 3–4:**
  - If `hints[level-1]` is already saved, return it with no call.
  - Otherwise one `hint_ladder` call fills both levels 3 and 4, saves them, and returns the one asked for.
- **Level 5:**
  - Only for items with a quote; otherwise 409 with "This item covers the whole essay, so there's no single sentence to rewrite."
  - If `rewrite` is already saved, return it.
  - Otherwise call `reserve_rewrite` before any LLM call. If it returns false: 429 with "You've used this draft's 3 suggested rewrites."
  - Then one `hint_rewrite` call, followed by the length check from Global Constraints. If the rewrite is too long, return 503 "Couldn't make a suggestion for this one."
  - Any failure after `reserve_rewrite` keeps the slot used **[call]**. A refund would need a delete path on `feedback_events`, and users must never have one.
- **Events:** every success inserts a `viewed_level` event and raises `highest_level`. `logCalls` records every attempt.

- [ ] **Step 1: Write the failing tests**

```ts
test('level 3 then level 4 makes one LLM call total', ...);
test('another user item is 404 with no LLM call', ...);
test('fourth rewrite on a draft is 429 with no LLM call', ...);
test('rewrite longer than the cap is discarded and reported', ...);
test('global item rewrite is 409 with the whole-essay message', ...);
test('highest_level rises and a viewed_level event is stored', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit:** `git commit -m "feat: on-demand hint levels and capped rewrites"`

---

### Task 7: Write tab, essay list, and new-essay setup

**Files:**
- Modify: `src/components/nav.tsx` (add `{ key: 'write', label: 'Write', href: '/write' }` between Study and Profile; the grid goes to 4 columns)
- Create:
  - `src/app/(app)/write/page.tsx`
  - `src/app/(app)/write/new/page.tsx`
  - `src/app/(app)/write/new/new-essay-form.tsx`
  - `src/app/(app)/write/actions.ts`
  - `src/lib/essay/extract.ts`
- Test: `tests/app/write.test.tsx`, `tests/db/essay-actions.test.ts`

**Interfaces:**
```ts
export async function createEssay(input: { title: string; essayType: EssayType; gradeLevel: string; assignmentPrompt: string | null;
  citationStyle: string | null; content: string }): Promise<{ ok: true; essayId: string } | { ok: false; error: string }>;
// extract.ts (browser only, lazy imports like pdf.ts)
export async function extractEssayFile(file: File): Promise<{ ok: true; text: string } | { ok: false; error: string }>;
```
- **`createEssay`** validates with zod plus `validateEssay`. It inserts the essay and draft version 1, with `paragraph_hashes` filled in, through RLS, and returns the error messages from Task 3.
- **The essay list (A-S1):**
  - Newest first, each with a status chip: "Feedback ready" (latest draft's global layer done), "Waiting for feedback" (not run yet), or "Revising" (more than one draft).
  - A primary "New essay" button.
  - Empty state, following the DESIGN.md pattern: heading "No essays yet", the line "Paste a draft and get feedback that helps you revise it yourself.", and the button "New essay".
- **The setup screen (A-S2):**
  - Step 1: a title field, plus a labelled "Your essay" textarea with a file button (`.pdf`, `.docx`).
  - Step 2: "Assignment details (optional)" in a `<details>` element, holding the prompt, essay type, grade level and citation style.
  - "Get feedback" saves the essay and goes to `/write/{essayId}`.
- **File errors:** "This PDF has no selectable text. Paste the text instead." and "We can only read .pdf and .docx files."

- [ ] **Step 1: Write the failing tests**

```ts
test('Write nav item is current on /write and the list shows status chips', ...);
test('empty list shows No essays yet with a New essay link', ...);
test('setup form shows the word-limit error before saving', ...);
test('createEssay saves essay and draft 1 with paragraph hashes; another user cannot read it', ...);
test('a .txt upload is refused with the file-type message', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md. Install `mammoth` and `diff` with exact pins.
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `git commit -m "feat: Write tab, essay list, and new-essay setup"`

---

### Task 8: Essay screen: feedback panel, highlights, hints, and focus mode

**Files:**
- Create:
  - `src/app/(app)/write/[essayId]/page.tsx`
  - `src/app/(app)/write/[essayId]/essay-view.tsx` (client)
  - `src/app/(app)/write/[essayId]/feedback-card.tsx`
  - `src/app/(app)/write/[essayId]/focus.tsx`
  - `src/app/(app)/write/[essayId]/item-actions.ts`
- Modify: `src/app/globals.css` (layer tokens), `src/lib/profile/require.ts` (`preferences.show_scores?: boolean`), and the onboarding form (a "Show rubric scores" checkbox, on by default)
- Test: `tests/app/essay-view.test.tsx`

**Interfaces:**
- `item-actions.ts` server actions: `markGotIt(itemId)`, `disputeItem(itemId, reason)`, and `logViewedLevel(itemId, level: 1 | 2)`. Each writes the item and a `feedback_event`. Reasons are 1–1,000 characters.
- **Layout (A-S3):**
  - From 768px: the essay on the left (about 60%), feedback on the right.
  - On phones the feedback stacks below the essay, with a "Jump to feedback" link **[call]**. No bottom sheet.
- **Loading:**
  - On mount, the page calls the analyze route for each layer that isn't `done`, in order: global, paragraphs, sentences.
  - While each runs it shows "Reading the big picture…", "Checking paragraphs…" or "Checking sentences…".
  - A failed layer shows its message with "Try again" for that layer only (A5.5).
- **The feedback panel, in order:**
  1. **Strengths.** Each strength anchors to its quote.
  2. **Top 3 priorities.**
  3. **"Show all".** Opens the remaining items grouped by layer. Sentence items stay collapsed, with a count, while any global item is open; the student can expand them anyway (A2.2).
  4. **Rubric scores.** Each shows its justification and confidence; low confidence reads "Estimate". Hidden when `show_scores` is false.
- **Feedback cards:**
  - Each card shows its layer label, the summary, and "Show in essay".
  - "Show next hint" reveals levels 1 → 5. Levels 1–2 are already stored; levels 3–5 come from `/api/essays/hint`, and level 5 shows the remaining rewrites count.
  - **Got it**, and **I disagree**, which opens a reason field and marks the item "Disputed".
  - Sentence items show the LanguageTool message and a "Show suggestion" button for its replacements. These don't count against the rewrite cap.
- **Highlights:** `<mark>` spans tagged with their layer label. When anchors overlap, only the highest-ranked item is highlighted **[call]**.
- **Focus mode (A-S4):** one Top-3 item at a time. Its paragraph is shown and the rest dimmed. "2 of 3 priorities addressed", with Show next hint, Got it, I disagree and Skip.
- **Safety:** when `safety_concern` is true, the panel opens with a supportive card: "It sounds like you're going through something hard. You don't have to handle it alone." It lists resources: the NCMH crisis line 1553 (Philippines) and findahelpline.com **[call]**. It never diagnoses and notifies no one.

- [ ] **Step 1: Write the failing tests** (mocked `fetch` and actions)

```ts
test('layers load in order with their progress copy; a failed paragraph layer shows Try again while global feedback stays', ...);
test('Top 3 shows the three highest-ranked open items; Show all groups the rest by layer', ...);
test('sentence items are collapsed with a count while a global item is open', ...);
test('clicking a highlight focuses its card; Show in essay focuses the highlight', ...);
test('Show next hint reveals level 1, then 2, then requests level 3', ...);
test('level 5 at the cap shows the rewrite-limit message', ...);
test('I disagree requires a reason and marks the card Disputed', ...);
test('low-confidence score reads Estimate; show_scores false hides scores', ...);
test('safety_concern shows the support card first', ...);
test('focus mode steps through Top 3 with keyboard only', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md, then run the Impeccable detector over `/write/*` and fix what it reports.
- [ ] **Step 4: Run, expect PASS:** `npm test`.
- [ ] **Step 5: Commit:** `git commit -m "feat: essay feedback screen with hints, highlights, and focus mode"`

---

### Task 9: Revise, re-check, and draft compare

**Files:**
- Create: `src/app/(app)/write/[essayId]/editor.tsx`, `src/app/(app)/write/[essayId]/compare/page.tsx`
- Modify: `src/app/(app)/write/actions.ts` (add `saveDraft`)
- Test: `tests/app/essay-revise.test.tsx`, `tests/db/essay-actions.test.ts` (extend)

**Interfaces:**
```ts
export async function saveDraft(essayId: string, content: string): Promise<{ ok: true; draftId: string; version: number } | { ok: false; error: string }>;
```
- **`saveDraft`:**
  - Validates with `validateEssay`.
  - Inserts `version = latest + 1`. A unique-constraint conflict retries once with the new latest version.
  - Content identical to the latest draft returns that draft's id without inserting: "No changes since your last check."
- **The editor:**
  - An "Edit" toggle on the essay view swaps the highlighted text for a labelled textarea.
  - Unsent edits are saved to `localStorage` under `scholar-essay-draft-{essayId}`, read with try/catch, and cleared after `saveDraft` succeeds.
  - "Re-check" calls `saveDraft`, then runs the three layers on the new draft.
  - Offline, Re-check is disabled with "You're offline. Your edits are saved on this device; re-check when you're back online." (A5.5).
- **After a re-check:** the panel shows "3 addressed · 1 partly addressed · 2 still open since draft {n−1}".
- **Compare (A-S6, inline diff only, spec §7 cut):**
  - The URL is `/write/{essayId}/compare?from=1&to=2`.
  - It shows a `diffWords` inline diff. Insertions are underlined with the label "added"; deletions are struck through with the label "removed". Colour is never the only signal.
  - Below the diff: a table of rubric scores per draft, and each earlier item with its status change.

- [ ] **Step 1: Write the failing tests**

```ts
test('saveDraft with unchanged text returns the existing draft', ...);
test('two saveDraft calls at once produce versions 2 and 3, no error', ...);
test('edits survive a reload via localStorage and clear after Re-check', ...);
test('Re-check while offline is disabled with the offline message', ...);
test('after re-check the carry-over summary counts addressed, partial, open', ...);
test('compare marks added and removed words with text labels and lists score changes', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `git commit -m "feat: revise and re-check with carry-over, draft compare"`

---

### Task 10: Today, disclosure, and quota display

**Files:**
- Modify: `src/app/(app)/today/plan.tsx`, `src/app/(app)/today/page.tsx`, `src/app/onboarding/onboarding-form.tsx`, `src/app/(app)/write/page.tsx`
- Test: `tests/app/today-plan.test.tsx` (extend), `tests/app/write.test.tsx` (extend), `tests/app/onboarding.test.tsx` (extend)

**Interfaces:**
- `TodayPlan` gains the prop `essays: { id: string; title: string; openTop3: number }[]`. The page loads it for essays whose latest draft has open or partial items ranked in the top 3.
- **The Today list, in order (spec §8.3):**
  1. The reviews card.
  2. One line per essay: "{title} · {n} of 3 priorities open", linking to `/write/{id}`.
  3. Exam countdowns.
- **The primary action:**
  - The reviews card when cards are due.
  - Otherwise the first essay line becomes the primary card, with the button "Keep revising" **[call]**. Essays have no deadlines in 1b.
- **The Write list** shows "{n} essay checks left today" from `quota_usage` (spec §6.5).
- **The onboarding disclosure sentence becomes:** "Scholar uses AI to make flashcards, check your answers, and give essay feedback. Your text is sent to Groq for this, and essays are also checked by LanguageTool for spelling and grammar. Groq's terms say it does not train its models on what you send." **[call]** on LanguageTool. Its public API is free; confirm its current privacy terms before launch. Update the `ponytail:` comment next to the sentence so it names both services.

- [ ] **Step 1: Write the failing tests**

```ts
test('Today lists an essay with open priorities after reviews and before exams', ...);
test('with no reviews due, the essay becomes the primary card with Keep revising', ...);
test('Write list shows essay checks left today', ...);
test('onboarding disclosure names Groq and LanguageTool', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test`, `npm run test:db`, and `npm run build` all pass.
- [ ] **Step 5: Commit:** `git commit -m "feat: essays on Today, essay quota display, updated AI disclosure"`

---

## Out of scope for 1b (recorded so they are not lost)

- **Deferred [call]:**
  - "Ask a question" item chat (A2.9). It costs one LLM call per message.
  - The AI rebuttal for "I disagree" (A3.10, Phase 2). Disputes are only stored.
  - Custom rubric upload.
  - The second scoring call on low confidence.
  - Expanding Top 3 to Top 5 after 3 addressed in a row (spec J5).
  - The growth snapshot on A-S1.
- **Cut by the spec (§7):** side-by-side diff (1b ships inline diff only).
- **Not handled in 1b:**
  - Language detection, and spotting creative writing submitted against an argumentative rubric (A7).
  - Essays over 2,000 words.
