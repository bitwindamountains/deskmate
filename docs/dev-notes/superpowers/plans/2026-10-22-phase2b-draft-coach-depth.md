# Phase 2b: Draft Coach Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feedback becomes a conversation. A student can:
- ask about a feedback item, or disagree with it and get a real answer;
- see which parts of the assignment prompt the essay covers, and a one-line outline of each paragraph;
- rate their own essay before feedback and compare it with the AI afterwards;
- read explanations in their first language;
- hear the essay read aloud.

**Architecture:**
- **Prompt alignment (A3.3) and the reverse outline (A3.2) add fields to the two passes already being made** (big picture and paragraphs), so they cost no new calls. They're stored on `analyses`.
- **Three on-demand features are new cached LLM tasks**, each taking the daily helper quota before the call:
  - Ask a question (A2.9) and I disagree (A3.10) share one task, `item_dialogue`, and one message table.
  - First-language explanations (A3.9) use a second task, `translate_feedback`.
- **Self-assessment (A3.7) and read-aloud (A3.11) are code only.** Read-aloud uses the browser's `speechSynthesis`.

**Tech Stack:** unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§5, §6, §8.1), plus the overview `docs/superpowers/plans/2026-10-21-phase2-overview.md`. Brief: A2.9, A3.2, A3.3, A3.7, A3.9, A3.10, A3.11, A5.3, D3.4, E2, E3, E6.

**Depends on:**
- 1b:
  - tables `essays`, `drafts`, `analyses`, `feedback_items`, `feedback_events`;
  - `analyzeLayer`, `essayGlobalPrompt`, `essayParagraphsPrompt`, `EssayGlobal`, `EssayParagraphs`, `anchorQuote`;
  - the essay view and `feedback-card.tsx`, `item-actions.ts`, `new-essay-form.tsx`, `insertEssay`;
  - `consume_hint_quota`, `logCalls`, `compactSchema`, `DEFAULT_RUBRIC`.
- 2a: `calibration` in `src/review/calibration.ts`, but only its pattern; essays get their own measure here.
- Profile: `first_language` and `LANGUAGES` (`en`, `fil`, `es`, `other`).

## Global Constraints

- **Earlier rules still apply:** `CLAUDE.md`, the earlier plans' Global Constraints, and the token-budget note.
- **Any changed or new prompt** re-runs the eval and adds a row to `docs/superpowers/notes/2026-10-21-token-budget.md`.
- **Daily quota:** every new LLM call takes one of the 60 daily helper calls (`consume_hint_quota`) before the call. A cached result is free.
- **No ghostwriting (brief E2):**
  - dialogue replies and translations never contain a sentence the student could paste into the essay;
  - replies are at most 120 words; anything longer is cut at the last full sentence before 120 words.
  - The prompts carry the 1b hint rule: "Say what to change, not the words to write."
- **Dialogue limit:** at most 4 coach replies per feedback item **[call]**. After that: "That's as far as I can take this one. Try the hint ladder, or mark it Got it."
- **"I disagree" outcomes** (A3.10, three):
  - `withdraw`: the item's status becomes `withdrawn` and it leaves Top 3.
  - `modify`: the item gets a revised summary, shown as "Updated: …", and the original stays visible.
  - `keep`: the coach clarifies its reasoning.
  - Every dispute is logged in `feedback_messages`. The student's own reason stays in `dispute_reason`, as in 1b.
- **Prompt alignment** runs only when the essay has an assignment prompt.
  - Each required part is `addressed`, `partial` or `missing`, labelled "Covered", "Partly covered" or "Not yet".
  - It shows as a checklist above Top 3. An off-prompt essay (any part `missing`) leads with it (brief A7).
- **Reverse outline:** one line per paragraph, ≤ 15 words. An optional flag is one of `repeats`, `off_topic` or `order`, labelled "Repeats an earlier point", "Drifts from your thesis" or "Might fit better elsewhere". The brief's drag-to-reorder preview is out of scope **[call]**.
- **Self-assessment** (A3.7, optional, on new essays only **[call]**):
  - one score per `DEFAULT_RUBRIC` criterion (1 to its `maxScore`), plus "What's your essay's biggest weakness?" (≤ 300 characters);
  - after feedback: a side-by-side table, and "You were within one point on N of M criteria."
- **First-language explanations:**
  - Per item only: an "Explain in {language}" button, shown when `first_language` is `fil` or `es` **[call]**. `other` has no fixed target language.
  - It translates the summary and the hint levels revealed so far. The essay quote stays in English.
  - Cached per item, language and revealed level.
  - Wording is neutral about language differences, never deficit framing (brief A3.9, E3).
- **Read-aloud:**
  - Controls Play/Pause and Stop. The sentence being read is highlighted with a text-labelled outline, never colour alone.
  - Hidden when `speechSynthesis` is missing.
  - Speech rate follows the reduced-motion preference (0.9 when reduced, otherwise 1.0) **[call]**.

## Review Focus

1. **A student disputes an item, the coach withdraws it, and the student re-checks.** Expect the withdrawn item not to carry over to the next draft. `planCarryOver` treats `withdrawn` like `addressed`. Tested in Task 3.
2. **The dialogue reply tries to rewrite the student's sentence**, or goes past 120 words. Expect it cut at a sentence boundary and never saved longer. Tested in Task 3.
3. **An essay with no assignment prompt.** Expect no alignment request, no empty checklist, and no extra output tokens. Tested in Task 2.
4. **User A posts B's `itemId` to the dialogue or translate route.** Expect 404 with no LLM call. Tested in Tasks 3 and 5.
5. **A browser without `speechSynthesis`, or Stop pressed mid-sentence.** Expect the controls hidden in the first case, and the highlight cleared with no stuck "Reading…" state in the second. Tested in Task 6.

---

### Task 1: Migration: dialogue, translations, self-assessment, withdrawn items, analysis extras

**Files:**
- Create: `supabase/migrations/20261022140000_scholar_draft_coach_depth.sql`
- Test: `tests/db/draft-coach-depth.test.ts`

**Interfaces:**
- **`scholar.feedback_items.status`:** the check gains `'withdrawn'`. `revised_summary text check (char_length ≤ 1000)` is added and written only through `scholar_private.revise_item(p_item_id uuid, p_summary text)` (security definer, owner check). There's no user update grant on it.
- **`scholar.analyses`:** gains `prompt_alignment jsonb` and `outline jsonb`, both nullable. `outline` is written by the paragraphs layer, after the `analyses` row may already exist, so it goes through `scholar_private.set_outline(p_draft_id uuid, p_outline jsonb)`: owner check, and it only sets a null outline.
- **`scholar.feedback_messages`:** `id`, `user_id`, `item_id uuid references feedback_items on delete cascade`, `role text check (in student, coach)`, `kind text check (in question, dispute)`, `text text not null check (char_length between 1 and 2000)`, `verdict text check (in keep, modify, withdraw)` (nullable), `created_at`.
  - RLS: owner select, and owner insert only for their own item.
  - No update or delete.
  - Index on `item_id` and on `user_id`.
- **`scholar.item_translations`:** `item_id uuid references feedback_items on delete cascade`, `user_id`, `lang text check (in fil, es)`, `level smallint check (level between 0 and 5)`, `result jsonb not null`, primary key `(item_id, lang, level)`. RLS owner select and insert (own item). No update.
- **`scholar.self_assessments`:** `draft_id uuid primary key references drafts on delete cascade`, `user_id`, `scores jsonb not null` (`[{criterion, score}]`), `weakness text check (char_length ≤ 300)`, `created_at`. RLS owner select and insert (own draft). No update.

- [ ] **Step 1: Write the failing tests**
```ts
test('feedback_items accepts status withdrawn; revise_item sets revised_summary for the owner only', ...);
test('set_outline writes once; a second call does not overwrite', ...);
test('feedback_messages: owner inserts for own item only; no update or delete', ...);
test('item_translations and self_assessments: owner-only insert and select', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3:** Write the migration. **The owner reviews it before it's applied.** Then apply it and run the advisors.
- [ ] **Step 4: Run, expect PASS:** the full `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: tables for item dialogue, translations, self-assessment`

---

### Task 2: Prompt alignment and reverse outline in the existing passes (A3.3, A3.2)

**Files:**
- Modify:
  - `src/llm/schemas.ts`
  - `src/llm/prompts.ts`
  - `src/lib/essay/analyze.ts`
  - `src/app/(app)/write/[essayId]/essay-view.tsx` (alignment checklist, outline sidebar)
  - `src/lib/essay/carry.ts` (Task 3 needs `withdrawn` treated like `addressed`; do it here)
- Create: `src/app/(app)/write/[essayId]/alignment.tsx`, `src/app/(app)/write/[essayId]/outline.tsx`
- Test: `tests/llm/essay-prompts.test.ts` (extend), `tests/db/essay-analyze.test.ts` (extend), `tests/app/essay-view.test.tsx` (extend), `tests/lib/essay-carry.test.ts` (extend)

**Interfaces:**
```ts
// EssayGlobal gains (optional so a prompt without an assignment never asks for it):
prompt_alignment: z.array(z.object({ part: z.string().min(1), status: z.enum(['addressed', 'partial', 'missing']), note: z.string() })).optional(),
// EssayParagraphs gains:
outline: z.array(z.object({ paragraph_index: z.number().int().min(0), summary: z.string().min(1),
  flag: z.enum(['repeats', 'off_topic', 'order']).nullable() })).default([]),
```
- **`essayGlobalPrompt`** asks for `prompt_alignment` only when `assignmentPrompt` is set: "Split the assignment prompt into its required parts and judge each." Without an assignment, neither the instruction nor the field appears.
- **`essayParagraphsPrompt`** asks for an `outline` line for every paragraph it reports on (all paragraphs on draft 1; `onlyParagraphs` on a re-check).
- **`analyzeLayer` storage:**
  - The global layer stores `prompt_alignment` in `analyses`.
  - The paragraphs layer calls `set_outline`.
  - On a re-check, outline lines for unchanged paragraphs carry over from the previous draft's outline (matched by paragraph hash), and new lines fill in the changed ones.
- **UI:**
  - `alignment.tsx` is "What the assignment asks", with a status label per part. When any part is missing, it renders before Top 3.
  - `outline.tsx` is "Paragraph outline", an ordered list "P{n}: {summary}" with the flag label. Each line links to its paragraph.
- **Eval:** re-run the essays (low effort) and add a token-budget row. Gate: the samples with a prompt get a non-empty alignment; output tokens grow by ≤ 25% **[call]**.

- [ ] **Step 1: Write the failing tests**
```ts
test('global prompt asks for prompt_alignment only when the essay has an assignment prompt', ...);
test('paragraph prompt asks for an outline line per reported paragraph', ...);
test('global layer stores prompt_alignment; paragraphs layer stores the outline via set_outline', ...);     // db
test('re-check carries outline lines of unchanged paragraphs and fills changed ones', ...);                  // db
test('a missing part puts the alignment checklist before Top 3; labels are text', ...);
test('withdrawn items are not carried to the next draft', ...);                                           // carry
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, then run the eval and add the budget row.
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: prompt alignment checklist and reverse outline`

---

### Task 3: Ask a question and I disagree (A2.9, A3.10)

**Files:**
- Create: `src/lib/essay/dialogue.ts`, `src/app/api/essays/dialogue/route.ts`, `src/app/(app)/write/[essayId]/item-dialogue.tsx`
- Modify: `src/llm/{types,config,schemas,prompts}.ts` (task `item_dialogue`), `src/app/(app)/write/[essayId]/feedback-card.tsx`, `src/app/(app)/write/[essayId]/item-actions.ts`
- Test: `tests/llm/dialogue-prompt.test.ts`, `tests/db/essay-dialogue.test.ts`, `tests/app/essay-view.test.tsx` (extend)

**Interfaces:**
```ts
export const ItemDialogue = z.object({ reply: z.string().min(1), verdict: z.enum(['keep', 'modify', 'withdraw']).nullable(),
  revised_summary: z.string().nullable() });
export function itemDialoguePrompt(i: { gradeLevel: string; item: { summary: string; quote: string | null; category: string }; paragraph: string;
  history: { role: 'student' | 'coach'; text: string }[]; kind: 'question' | 'dispute'; message: string }): Prompt;
  // static system prompt; essay text, history and the student message all in wrapData. For a dispute the model must
  // weigh the student's reason honestly and may withdraw or modify; for a question verdict is null.
export async function sendDialogue(db: Db, userId: string, itemId: string, kind: 'question' | 'dispute', message: string,
  env: Record<string, string | undefined>, completeFn?: typeof complete):
  Promise<{ ok: true; reply: string; verdict: 'keep' | 'modify' | 'withdraw' | null; revisedSummary: string | null }
    | { ok: false; status: 404 | 409 | 429 | 503; message: string }>;
export async function POST(req: NextRequest): Promise<NextResponse>; // body { itemId: uuid, kind, message: 1..1000 chars }
```
- **Flow of `sendDialogue`:**
  1. Load the item and its paragraph through RLS (404 if missing).
  2. Count the coach messages. At 4: 409 with the limit copy.
  3. `consume_hint_quota`. If it returns false: 429 "You've asked for a lot of help today. More unlocks at midnight UTC."
  4. Call the LLM, then cut the reply to 120 words at a sentence boundary.
  5. Insert the student and coach messages.
  6. Apply the verdict for a dispute: `withdraw` sets status `withdrawn`; `modify` calls `revise_item`; `keep` changes nothing. Then also set `status = 'disputed'` and `dispute_reason` as in 1b, unless withdrawn.
- **UI:**
  - The card's "I disagree" and a new "Ask a question" open one thread panel ("Ask about this" / "Why doesn't this fit?").
  - Messages are in a list; the newest coach reply is announced in a `role="status"`.
  - Withdrawn cards show "Withdrawn after your explanation" and leave Top 3.
  - Modified cards show "Updated: {revised}" above the original summary.
- **Eval:** add an `item_dialogue` case (a dispute on the first sample's top item) to `eval/runEval.ts`, and add a budget row.

- [ ] **Step 1: Write the failing tests**
```ts
test('dialogue prompt is static and wraps essay, history and message as data; question has no verdict rule', ...);
test('a withdraw verdict sets the item withdrawn and it leaves Top 3', ...);                       // db + view
test('a modify verdict stores the revised summary through revise_item; the card shows Updated:', ...);
test('replies over 120 words are cut at a sentence boundary before saving', ...);
test('the fifth coach reply is 409 with the limit copy and no LLM call', ...);
test('another user item is 404 with no LLM call; helper limit reached is 429', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, then run the eval case and add the budget row.
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: ask a question and I disagree dialogue on feedback items`

---

### Task 4: Self-assessment and comparison (A3.7)

**Files:**
- Modify:
  - `src/app/(app)/write/new/new-essay-form.tsx` (an optional "Rate it yourself first" section)
  - `src/lib/essay/create-essay.ts` (`insertEssay` saves the self-assessment for draft 1)
  - `src/app/(app)/write/[essayId]/page.tsx`
- Create: `src/app/(app)/write/[essayId]/self-check.tsx`, `src/lib/essay/self-check.ts`
- Test: `tests/lib/self-check.test.ts`, `tests/db/essay-actions.test.ts` (extend), `tests/app/write.test.tsx` (extend), `tests/app/essay-view.test.tsx` (extend)

**Interfaces:**
```ts
export type SelfScore = { criterion: string; score: number };
export function compareSelf(self: SelfScore[], ai: { criterion: string; score: number }[]):
  { rows: { criterion: string; self: number | null; ai: number | null }[]; within: number; of: number };   // within one point
// EssayInput gains selfAssessment?: { scores: SelfScore[]; weakness: string | null }
```
- **The form:** a `<details>` "Rate it yourself first (optional)" with one 1..maxScore select per `DEFAULT_RUBRIC` criterion, plus the weakness field. If it's left untouched, nothing is saved.
- **After feedback:** "Your rating and the coach's", a table of criterion, you, coach. Then "You were within one point on N of M criteria." Then the student's own "biggest weakness" next to the coach's Top 1.
- **No LLM.**

- [ ] **Step 1: Write the failing tests**
```ts
test('compareSelf counts criteria within one point and ignores criteria only one side scored', ...);
test('createEssay saves the self-assessment with draft 1 when given and nothing when untouched', ...);   // db
test('the essay view shows the comparison table and the within-one-point line after the global layer', ...);
test('a score outside 1..maxScore is rejected at the server', ...);                                      // db
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: self-assessment before feedback and comparison after`

---

### Task 5: First-language explanations (A3.9)

**Files:**
- Create: `src/lib/essay/translate.ts`, `src/app/api/essays/translate/route.ts`
- Modify:
  - `src/llm/{types,config,schemas,prompts}.ts` (task `translate_feedback`)
  - `src/app/(app)/write/[essayId]/feedback-card.tsx`
  - `src/app/(app)/write/[essayId]/page.tsx` (pass `first_language`)
- Test: `tests/llm/translate-prompt.test.ts`, `tests/db/essay-translate.test.ts`, `tests/app/essay-view.test.tsx` (extend)

**Interfaces:**
```ts
export const TranslatedFeedback = z.object({ summary: z.string().min(1), hints: z.array(z.string()) });
export function translateFeedbackPrompt(i: { lang: 'fil' | 'es'; summary: string; hints: string[] }): Prompt; // static system; text in wrapData
export async function translateItem(db: Db, userId: string, itemId: string, lang: 'fil' | 'es', env: Record<string, string | undefined>,
  completeFn?: typeof complete): Promise<{ ok: true; summary: string; hints: string[]; cached: boolean } | { ok: false; status: 404 | 429 | 503; message: string }>;
```
- **What's translated:** the summary plus the hints up to the item's `highest_level`. A new level revealed later is a new cache row, keyed by `(item, lang, level)`.
- **The prompt** keeps essay quotes and rubric names in English, and frames language differences neutrally.
- **The card:** an "Explain in Filipino" or "Explain in Spanish" toggle, showing the translation under the English. A second toggle hides it. Uses `lang="fil"` or `lang="es"` on the translated block.
- **Eval:** add a `translate_feedback` case to `eval/runEval.ts` (Filipino, the first sample's top item), and add a budget row.

- [ ] **Step 1: Write the failing tests**
```ts
test('translate prompt keeps quotes in English and is static', ...);
test('second request for the same item, language and level is cached with no LLM call', ...);
test('revealing a new hint level makes a new cache entry', ...);
test('another user item is 404 with no LLM call', ...);
test('the Explain in Filipino toggle shows only for fil/es profiles and marks the block lang="fil"', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, then run the eval case and add the budget row.
- [ ] **Step 4: Run, expect PASS:** `npm test` and `npm run test:db`.
- [ ] **Step 5: Commit:** `feat: first-language explanations for feedback items`

---

### Task 6: Read-aloud (A3.11)

**Files:**
- Create: `src/app/(app)/write/[essayId]/read-aloud.tsx`, `src/lib/essay/sentences.ts`
- Modify: `src/app/(app)/write/[essayId]/essay-view.tsx`
- Test: `tests/lib/sentences.test.ts`, `tests/app/read-aloud.test.tsx`

**Interfaces:**
```ts
export function splitSentences(paragraph: string): { start: number; end: number }[]; // Intl.Segmenter('en', { granularity: 'sentence' }), trimmed
```
- **Reading:** one `SpeechSynthesisUtterance` per sentence, queued paragraph by paragraph. `onstart` sets the highlighted sentence; `onend` or `onerror` clears it.
- **Controls:** a `role="group"` named "Read aloud", with a Play/Pause toggle (`aria-pressed`) and Stop.
- **The highlight** is an outline plus a visually hidden "Now reading" label. It's never colour alone.
- **Hidden** when `typeof window.speechSynthesis === 'undefined'`.

- [ ] **Step 1: Write the failing tests** (mock `speechSynthesis` and `SpeechSynthesisUtterance`)
```ts
test('splitSentences splits on sentence ends and keeps offsets into the paragraph', ...);
test('Play queues one utterance per sentence; onstart highlights that sentence', ...);
test('Stop cancels speech and clears the highlight', ...);
test('controls are hidden when speechSynthesis is missing', ...);
test('reduced motion slows the rate to 0.9', ...);
```
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** to DESIGN.md.
- [ ] **Step 4: Run, expect PASS:** `npm test`, then `npm run build`.
- [ ] **Step 5: Commit:** `feat: read the essay aloud with sentence highlighting`

---

## Out of scope for 2b

- **Assigned to 2c and 2d in the overview:** growth profile, essay → cards, personas, argument map, citation checker, voice preservation, OCR.
- **Calls made here:**
  - drag-to-reorder in the outline;
  - self-assessment on re-checks;
  - translating the whole panel at once;
  - an `other` first language.
- **Not in this phase:** the teacher view of disputes (A3.10's teacher review is Phase 3).
