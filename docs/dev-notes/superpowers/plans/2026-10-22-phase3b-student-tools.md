# Phase 3b Student Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three students-only Phase 3 features from the brief: Anki `.apkg` import (B4.5), course-goal weighting (B4.3), and prerequisite remediation (B4.1).

**Architecture:** All three run without LLM calls. `.apkg` files are unzipped and read on the device (fflate, fzstd, sql.js) and only the extracted cards go to the server, through the same insert path as CSV import. Course goals are matched to cards with the on-device embedder that triage already uses; a match raises the card's scheduling weight by one. Prerequisites are concept-to-concept edges the student draws per deck; the mastery map suggests weak prerequisites when a concept has a leech card.

**Tech Stack:** Next.js 16, React 19, Supabase (RLS), vitest, `@huggingface/transformers` (existing), new: `fflate`, `fzstd`, `sql.js`.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` and the brief's B4.1, B4.3, B4.5 (`ai-learning-platform-brief.md`). Owner decisions 2026-10-22: students only, free-tier AI only.

## Global Constraints

- Free, open-source dependencies only; pin exact versions with `npm i -E`: `fflate@0.8.3`, `fzstd@0.1.1`, `sql.js@1.14.2` (1.15.x is under two weeks old).
- No new LLM calls. B4.3's "card generation prioritizes goals" is out of scope (it would add prompt tokens); scheduling only.
- `.apkg` export is out of scope: Anki imports the existing "Export for Anki" text file, and writing Anki's SQLite schema is fragile. Record as a ruling.
- Touch only schemas `scholar` and `scholar_private`. Migration is hand-written and shown to the owner before it is applied; run advisors after.
- Every new table: RLS on, `revoke all ... from public, anon, authenticated`, explicit grants, `grant all ... to service_role`, policies `to authenticated` with `(select auth.uid()) = user_id`.
- Import limits match CSV: 2,000 cards per import, front/back 1–500 characters, concept up to 120.
- WCAG 2.2 AA: every control has a label, status changes go through `role="status"`, errors through `role="alert"`, strength is never shown by color alone.
- No guilt-based copy. LF line endings.

## Review Focus

1. A `.apkg` from current Anki holds `collection.anki21b` (zstd) plus a dummy `collection.anki2` whose only note says "please update Anki". The reader must prefer `anki21b`, then `anki21`, then `anki2`, or students import one useless card. (Task 1 test.)
2. Anki fields are HTML: `<br>`, `<div>`, entities, `<img>`, `[sound:…]`. Text must come out readable, and an image-only side must skip the note, not create a blank card. (Task 1 test.)
3. Saving goals when the on-device model can't load: the goal text saves, existing matches stay as they were, and the student is told plainly. (Task 4 test.)
4. A prerequisite edge whose concept was renamed or whose cards were deleted: ignored on the mastery map, still removable in the editor, no crash. (Task 5 test.)
5. A goal match on a deck of 2,000 cards: one atomic call, not 2,000 updates or an over-long URL. (Task 3 DB test, Task 4 action.)

---

### Task 1: Anki package reader

**Files:**
- Create: `src/lib/cards/apkg.ts`
- Create: `public/vendor/sql-wasm-1.14.2.wasm` (copied from `node_modules/sql.js/dist/sql-wasm.wasm`)
- Modify: `package.json` (deps), `next.config.ts` (browser-only alias for `sql.js`, like pdf.js)
- Test: `tests/lib/apkg.test.ts`

**Interfaces:**
- Consumes: `CsvCard` from `src/lib/cards/csv.ts`.
- Produces:
  - `ankiText(html: string): string`: strips tags (`<br>`, `<div>`, `<p>` become newlines), removes `[sound:…]`, decodes `&nbsp; &amp; &lt; &gt; &quot; &#39; &#NNN; &#xHH;`, trims, collapses 3+ newlines to 2.
  - `clozeCards(text: string): { front: string; back: string }[]`: one card per distinct cloze number; that number's deletions stay as `{{c1::answer}}` (renumbered to c1, hint after `::` dropped), the others become their plain answer; back = that number's answers joined with `; `.
  - `readApkg(bytes: Uint8Array, wasmUrl?: string): Promise<{ cards: CsvCard[]; skipped: number; error?: string }>`.

- [ ] **Step 1: Write the failing tests** in `tests/lib/apkg.test.ts`. Build fixtures in the test with `sql.js` (node loads its own wasm), `fflate.zipSync`, and `zlib.zstdCompressSync` for `anki21b`. Fixture tables: `notes(id integer, flds text, tags text)` is all the reader needs.

```ts
test('ankiText turns Anki HTML into plain text', () => {
  expect(ankiText('Cell<br>wall&nbsp;&amp; <b>membrane</b>[sound:a.mp3]')).toBe('Cell\nwall & membrane');
  expect(ankiText('<div>One</div><div>Two</div>')).toBe('One\nTwo');
  expect(ankiText('&#233;t&#xE9;')).toBe('été');
  expect(ankiText('<img src="x.png">')).toBe('');
});

test('clozeCards makes one card per cloze number', () => {
  expect(clozeCards('{{c1::Paris}} is in {{c2::France::country}}')).toEqual([
    { front: '{{c1::Paris}} is in France', back: 'Paris' },
    { front: 'Paris is in {{c1::France}}', back: 'France' },
  ]);
  expect(clozeCards('no cloze here')).toEqual([]);
});

test('readApkg reads basic and cloze notes, uses the first tag as concept, skips empty sides', async () => {
  const bytes = await apkg({ 'collection.anki2': [
    ['Q1', 'A1', ' Biology::Cells '],
    ['{{c1::Mitochondria}} make ATP', 'extra'],
    ['<img src="x.png">', 'A3'],
  ] });
  const r = await readApkg(bytes);
  expect(r.cards).toEqual([
    { front: 'Q1', back: 'A1', concept: 'Biology / Cells', type: 'basic' },
    { front: '{{c1::Mitochondria}} make ATP', back: 'Mitochondria', concept: '', type: 'cloze' },
  ]);
  expect(r.skipped).toBe(1);
});

test('readApkg prefers anki21b over the dummy anki2 newer Anki writes', async () => {
  const bytes = await apkg({ 'collection.anki2': [['Please update to the latest Anki version', '']],
    'collection.anki21b': [['Real Q', 'Real A']] });
  expect((await readApkg(bytes)).cards.map((c) => c.front)).toEqual(['Real Q']);
});

test('readApkg reports files that are not Anki packages and caps the card count', async () => {
  expect((await readApkg(new Uint8Array([1, 2, 3]))).error).toBe("That file isn't an Anki package (.apkg).");
  expect((await readApkg(zipSync({ 'x.txt': new Uint8Array(1) }))).error).toBe("That file isn't an Anki package (.apkg).");
  const many = await apkg({ 'collection.anki2': Array.from({ length: 2001 }, (_, i) => [`q${i}`, `a${i}`]) });
  expect((await readApkg(many)).error).toBe('Import at most 2,000 cards at a time.');
});
```

Fields are joined with `\x1f` in `flds`; tags are space-separated in `tags`. Over-500-character sides count as skipped.

- [ ] **Step 2: Run** `npx vitest run tests/lib/apkg.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Install** `npm i -E fflate@0.8.3 fzstd@0.1.1 sql.js@1.14.2` (and `npm i -E -D @types/sql.js` at its latest version over two weeks old). Copy the wasm into `public/vendor/sql-wasm-1.14.2.wasm`. Add `'sql.js': browserOnly('sql.js')` to `next.config.ts`.
- [ ] **Step 4: Implement `src/lib/cards/apkg.ts`.** `unzipSync` with a `filter` that keeps only `collection.anki21b`, `collection.anki21`, `collection.anki2`; `fzstd.decompress` for `anki21b`; `initSqlJs({ locateFile: () => wasmUrl })` when `wasmUrl` is given (the browser passes `/vendor/sql-wasm-1.14.2.wasm`; tests pass nothing); `select flds, tags from notes order by id`; close the db in `finally`. A note is cloze when its first field contains `{{c\d+::`. Concept = first tag, `::` → ` / `, `_` → space, max 120. Any thrown error → the not-an-Anki-package message.
- [ ] **Step 5: Run** `npx vitest run tests/lib/apkg.test.ts`. Expected: PASS. Then `npm run build`. Expected: build succeeds (sql.js stays out of server bundles).
- [ ] **Step 6: Commit** `feat: read Anki .apkg packages on the device`

### Task 2: Import .apkg into a deck

**Files:**
- Modify: `src/lib/cards/transfer.ts`, `src/app/(app)/study/deck/[deckId]/actions.ts`, `src/app/(app)/study/deck/[deckId]/transfer.tsx`
- Test: `tests/db/card-import.test.ts` (add cases), `tests/app/deck-transfer.test.tsx` (add cases)

**Interfaces:**
- Consumes: `readApkg` (Task 1), `CsvCard`.
- Produces:
  - `insertCards(db: Db, userId: string, deckId: string, cards: CsvCard[], skippedRows: number[]): Promise<ImportResult>`, the body of today's `importCards` after parsing. `importCards` becomes parse + `insertCards`.
  - Server action `importAnki(deckId: string, cards: CsvCard[]): Promise<ImportResult>`, validated with zod: deck id uuid; array 1–2,000; front/back trimmed 1–500; concept ≤120; type enum.

- [ ] **Step 1: Write the failing tests.** DB: `insertCards` with two cards, one already in the deck, returns `{ ok: true, added: 1, inDeck: 1, inFile: 0, skippedRows: [] }`. Component: choosing a `.apkg` file calls `importAnki` with the cards `readApkg` returned (mock `@/lib/cards/apkg`) and shows `Added 2 cards. Skipped 1 note: a side was empty or over 500 characters.`; a `readApkg` error shows in `role="alert"`; a file over 100 MB shows `Choose an Anki package under 100 MB.` without reading it.
- [ ] **Step 2: Run** `npx vitest run tests/app/deck-transfer.test.tsx` and `npm run test:db -- card-import`. Expected: FAIL.
- [ ] **Step 3: Implement.** Extract `insertCards`. Add `importAnki`. In `transfer.tsx`, the file input accepts `.csv,text/csv,.apkg`; a name ending `.apkg` goes through `readApkg(new Uint8Array(await file.arrayBuffer()), '/vendor/sql-wasm-1.14.2.wasm')` (dynamic `import()` so the libraries load only then), then `importAnki`; the skipped-note sentence uses "note"/"notes". The size limit is 100 MB for `.apkg` (media inflates packages; the reader skips media), 1 MB for CSV. Help text: `Import a CSV (first row "front" and "back") or an Anki package (.apkg). Images and sounds are left out.`
- [ ] **Step 4: Run** the same tests. Expected: PASS. Then `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: import Anki packages into a deck`

### Task 3: Migration for goals and prerequisites

**Files:**
- Create: `supabase/migrations/20261022170000_scholar_goals_prereqs.sql`
- Test: `tests/db/goals-prereqs.test.ts`

**Interfaces:**
- Produces:
  - `scholar.decks.goals text not null default ''` with `check (length(goals) <= 5000)`.
  - `scholar.cards.goal_match boolean not null default false`.
  - `scholar.set_goal_matches(p_deck uuid, p_goals text, p_ids uuid[]) returns integer` (security invoker, `set search_path = ''`, grant execute to authenticated): raises if the deck isn't the caller's; updates `decks.goals`; when `p_ids` is not null, sets `goal_match = (id = any(p_ids))` for every card of the deck in one statement; returns the number of matched cards in the deck. `p_ids` null leaves matches unchanged and returns the current count.
  - Table `scholar.concept_prereqs(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, deck_id uuid not null references scholar.decks on delete cascade, concept text not null, prereq text not null, created_at timestamptz not null default now())`, `unique (deck_id, concept, prereq)`, `check (concept <> prereq)`, both `check (length between 1 and 120)` and `check (x = lower(btrim(x)))`; index on `(user_id)`. Grants select, insert, delete to authenticated. Policies: select and delete `using ((select auth.uid()) = user_id)`; insert `with check ((select auth.uid()) = user_id and exists (select 1 from scholar.decks d where d.id = deck_id and d.user_id = (select auth.uid())))`.

- [ ] **Step 1: Write the failing DB tests:** `set_goal_matches` on the user's deck with 2 of 3 card ids returns 2 and flips exactly those; a second call with 1 id returns 1 and clears the other; `p_ids` null keeps matches and saves goals; another user's deck raises; 5,001-character goals raise. `concept_prereqs`: insert own row works; insert onto another user's deck fails; `concept = prereq` fails; `'Cells '` (not normalized) fails; another user can't select it.
- [ ] **Step 2: Run** `npm run test:db -- goals-prereqs`. Expected: FAIL (column/function/table missing).
- [ ] **Step 3: Write the migration.** Show it to the owner (AskUserQuestion: apply / change) before applying with `apply_migration`; then run the security and performance advisors and fix any new finding in this migration.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: course goals and concept prerequisites schema`

### Task 4: Course-goal matching and scheduling weight

**Files:**
- Create: `src/review/goals.ts`, `src/app/(app)/study/deck/[deckId]/goals.tsx`
- Modify: `src/review/schedule.ts`, `src/lib/review/load.ts`, `src/app/(app)/study/deck/[deckId]/actions.ts`, `src/app/(app)/study/deck/[deckId]/page.tsx`
- Test: `tests/review/goals.test.ts`, `tests/review/schedule.test.ts` (add), `tests/app/goals.test.tsx`

**Interfaces:**
- Consumes: `set_goal_matches` (Task 3), `getEmbedder`, `cosine`.
- Produces:
  - `GOAL_MATCH = 0.5` (cosine threshold; ponytail comment: chosen by hand for MiniLM, re-tune from browser QA).
  - `goalLines(text: string): string[]`: split on newlines and `;`, strip leading bullets/numbering (`-`, `*`, `•`, `1.`, `1)`, `a)`), keep lines with at least 3 words, at most 200.
  - `matchGoals(goalVecs: number[][], cards: { id: string; vec: number[] }[], threshold = GOAL_MATCH): string[]`: ids whose best cosine against any goal is ≥ threshold.
  - `StudyCard.goalMatch?: boolean`; `weight(c: StudyCard): number` = `importance + (goalMatch ? 1 : 0)`, exported from `schedule.ts` and used for both the exam priority and the new-card order.
  - `ReviewCard` gets `goalMatch` from `cards.goal_match` in `loadStudy`.
  - Server action `saveGoals(deckId: string, goals: string, matched: string[] | null): Promise<{ ok: true; matched: number } | { ok: false; message: string }>`.

- [ ] **Step 1: Write the failing tests.**

```ts
test('goalLines keeps objective-sized lines without bullets', () => {
  expect(goalLines('1. Explain how cells make energy\n- osmosis\n• Compare mitosis and meiosis; describe the cell cycle'))
    .toEqual(['Explain how cells make energy', 'Compare mitosis and meiosis', 'describe the cell cycle']);
});
test('matchGoals returns cards near any goal', () => {
  expect(matchGoals([[1, 0]], [{ id: 'a', vec: [0.9, 0.1] }, { id: 'b', vec: [0, 1] }])).toEqual(['a']);
});
test('a goal match outranks a card of the same importance among new cards', () => {
  const card = (id: string, goalMatch: boolean): StudyCard => ({ id, deckId: 'd', type: 'basic', importance: 2, state: null, goalMatch });
  const s = buildSession([card('plain', false), card('goal', true)], { now: new Date(), minutes: 20, newIntroducedToday: 0, examDate: null });
  expect(s.queue.map((c) => c.id)).toEqual(['goal', 'plain']);
  expect(weight(card('goal', true))).toBe(3);
});
```

Component (`goals.tsx`, mock `getEmbedder` and the action): saving with a working embedder calls `saveGoals(deckId, text, ['a'])` and shows `3 of 10 cards match your course goals.` (count from the action); with `getEmbedder` resolving `null` it calls `saveGoals(deckId, text, null)` and shows `Goals saved. Matching cards needs a model download that didn't finish; try again later.`; with no goal lines it calls `saveGoals(deckId, text, [])`.

- [ ] **Step 2: Run** `npx vitest run tests/review/goals.test.ts tests/review/schedule.test.ts tests/app/goals.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Embed card text as `${front}\n${back}` in batches of 32. `saveGoals` validates (uuid, goals ≤5,000, ids ≤2,000 uuids) and calls the RPC once. `page.tsx` loads `goals` with the deck and passes `{ id, front, back }` for every listed card. The section is titled "Course goals", has a labelled textarea (`Paste your syllabus, learning objectives or past exam questions`), the button `Save and match cards`, and the hint `Matched cards come up sooner in reviews. Save again after adding cards.`
- [ ] **Step 4: Run** the same tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: course goals raise matching cards in the review order`

### Task 5: Prerequisites and remediation

**Files:**
- Create: `src/review/prereqs.ts`, `src/app/(app)/study/deck/[deckId]/prereqs.tsx`
- Modify: `src/app/(app)/study/deck/[deckId]/actions.ts`, `src/app/(app)/study/deck/[deckId]/page.tsx`, `src/app/(app)/study/mastery/page.tsx`, `src/app/(app)/study/mastery/mastery-view.tsx`
- Test: `tests/review/prereqs.test.ts`, `tests/app/prereqs.test.tsx`, `tests/app/mastery.test.tsx` (add)

**Interfaces:**
- Consumes: `concept_prereqs` (Task 3), `ConceptMastery`, `ReviewCard`, `LEECH_LAPSES` from `src/growth/learner.ts`.
- Produces:
  - `type Edge = { deckId: string; concept: string; prereq: string }` (keys are trimmed lower-case).
  - `wouldCycle(edges: Edge[], deckId: string, concept: string, prereq: string): boolean`: true when `prereq` already (transitively) builds on `concept` in that deck.
  - `type Remedy = { deckId: string; concept: string; prereqs: { key: string; label: string; strength: Strength }[] }`.
  - `remediation(mastery: ConceptMastery[], cards: ReviewCard[], edges: Edge[]): Remedy[]`: a concept is struggling when one of its cards has `state.lapses >= LEECH_LAPSES`; list its direct prerequisites that exist in `mastery` for that deck and are not `strong`; drop remedies with none left.
  - Server actions `addPrereq(deckId, concept, prereq)` and `removePrereq(deckId, concept, prereq)`, returning `{ ok: true } | { ok: false; message: string }`; `addPrereq` normalizes keys, rejects equal keys and cycles (`That would make a loop: X already builds on Y.`).

- [ ] **Step 1: Write the failing tests:** `wouldCycle` for a direct loop, a two-step loop, a different deck (false); `remediation` for a leech concept with one shaky and one strong prerequisite (only the shaky one listed), a concept with no leech (none), an edge to a concept missing from `mastery` (ignored, no throw). Editor: two selects labelled `Concept` and `Builds on`, `Add` calls `addPrereq`, each edge has a `Remove <concept> builds on <prereq>` button, an error message shows in `role="alert"`. Mastery view: a remedy renders `You keep missing Cell respiration. It builds on Glycolysis (shaky).` and a link `Review Glycolysis` to `/study/review?deck=<id>&concept=Glycolysis`.
- [ ] **Step 2: Run** `npx vitest run tests/review/prereqs.test.ts tests/app/prereqs.test.tsx tests/app/mastery.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** The deck page loads the deck's edges and passes concept options (distinct keys, most common spelling) to `prereqs.tsx`, titled "Builds on", with the hint `When you keep missing a concept, the mastery map suggests reviewing what it builds on.` Edges whose keys aren't in the options still list with their stored text so they can be removed. The mastery page loads all of the student's edges, computes `remediation`, and passes remedies into each section, shown above the concept list under the heading "Start with the basics".
- [ ] **Step 4: Run** the same tests, then `npm test` and `npm run build`. Expected: PASS, build succeeds.
- [ ] **Step 5: Commit** `feat: concept prerequisites and start-with-the-basics suggestions`
