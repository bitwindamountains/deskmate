# Phase 1a-2: Import, Card Generation, and Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user imports a PDF or pasted text into a deck, watches grounded flashcards arrive chunk by chunk, and keeps, discards, or edits each one.

**Architecture:** Text extraction happens in the browser (pdf.js); only the extracted text is sent to the server (spec §9: store extracted text, not originals). A server action stores the source and its chunks. The triage page drives generation one chunk at a time through `POST /api/generate`, so cards stream in without a job queue. The route checks the daily quota once per source, calls the Phase 0 router (`card_generate`, no-training providers only), drops ungrounded cards, and saves the rest as `pending`. Near-duplicates are found in the browser with on-device embeddings (transformers.js) and auto-discarded.

**Tech Stack:** Plan 1a-1's stack, plus `pdfjs-dist` 6.4 and `@huggingface/transformers` 4.3 (model `Xenova/all-MiniLM-L6-v2`, 384 dims).

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§4, §6.4, §6.5, §8.2 Triage, §9). Brief: B2.1, B2.2, B2.4, B2.5, B-S2, B-S3, B5.5, B7.

**Depends on:** `docs/superpowers/plans/2026-10-20-phase1a-1-foundation.md` (clients, `requireOnboardedUser`, DB test helpers, shell).

## Global Constraints

- Everything in plan 1a-1's Global Constraints applies.
- Phase 1a imports PDF and pasted text only. Images, DOCX, and PPTX come later (spec §7).
- One generation is at most 20 pages (pasted text counts as `ceil(words / 500)` pages) and at most 12,000 words **[call]**.
- Daily quota: 3 generations per user per UTC day (spec §6.5). It is consumed once per source, never per chunk or per retry.
- Every saved card's `source_quote` passes `isGrounded(chunk, quote)`; ungrounded cards are discarded and counted, never saved (brief B2.2 rule 9).
- Duplicate threshold: cosine similarity ≥ 0.9 **[call]** between card embeddings (front + " " + back).
- Uploaded text is data: generation uses `cardGeneratePrompt`, which wraps it in `<source>` (Phase 0).
- The user sees plain-language quota and error messages; raw provider errors never reach the UI.

## Review Focus

1. **A scanned PDF with no text layer.** Expect the message "This PDF has no selectable text. Paste the text instead; photo import comes later." No source is saved and no quota is spent. Tested in Task 2.
2. **Generation fails partway (AI busy) and the user retries.** Expect no second quota charge, and chunks already generated are not regenerated. Tested in Task 4.
3. **The model cites text from outside the chunk.** Expect the card dropped and counted in `dropped_ungrounded`. Tested in Task 4.
4. **User A posts B's `sourceId` to `/api/generate`.** Expect 404 and no LLM call. Tested in Task 4.
5. **A 100,000-word paste.** Expect it rejected in the form with the word limit stated, before anything is saved. Tested in Task 3.

---

### Task 1: Decks, sources, chunks, cards, quota, and call-log tables

**Files:**
- Create: `supabase/migrations/<timestamp>_study_content.sql` (via `npx supabase migration new study_content`)
- Modify: `src/llm/schemas.ts` (add `importance` to `Card`)
- Test: `tests/db/study-content.test.ts`, `tests/llm/schemas.test.ts`

**Interfaces:**
- Produces tables. All have `user_id uuid not null references auth.users(id) on delete cascade` and RLS; grants to `authenticated` are listed per table.

| table | columns (besides `id uuid pk default gen_random_uuid()`, `user_id`, `created_at timestamptz default now()`) | grants |
|---|---|---|
| `decks` | `title text not null check (length(title) between 1 and 120)`, `subject text`, `exam_date date` | select, insert, update, delete |
| `sources` | `deck_id uuid not null references decks on delete cascade`, `title text not null`, `kind text not null check (kind in ('pdf','text'))`, `page_count smallint not null check (page_count between 1 and 20)`, `quota_consumed_at timestamptz` | select, insert, delete |
| `source_chunks` | `source_id uuid not null references sources on delete cascade`, `position smallint not null`, `page_start smallint`, `page_end smallint`, `text text not null`, `generated_at timestamptz`, `unique (source_id, position)` | select, insert, update |
| `cards` | `deck_id uuid not null references decks on delete cascade`, `source_chunk_id uuid references source_chunks on delete set null`, `type text not null check (type in ('basic','cloze','why'))`, `front text not null`, `back text not null`, `key_points text[] not null default '{}'`, `source_quote text not null`, `concept text not null`, `bloom_level text not null`, `importance smallint not null check (importance between 1 and 3)`, `status text not null default 'pending' check (status in ('pending','kept','discarded'))`, `discard_reason text check (discard_reason in ('trivial','wrong','duplicate','unclear'))`, `embedding real[]` | select, insert, update, delete |
| `llm_calls` | `task text not null`, `provider text not null`, `model text not null`, `status text not null`, `tokens_in int`, `tokens_out int`, `latency_ms int` | select, insert |
| `quota_usage` | `day date not null`, `generations smallint not null default 0`, `essays smallint not null default 0`, primary key `(user_id, day)` (no `id`) | select |

- Indexes: `cards (deck_id, status)`, `source_chunks (source_id, position)` (covered by the unique constraint), and `user_id` on every table (RLS predicate column).
- Policies: per granted verb, `to authenticated` with `(select auth.uid()) = user_id` (insert: `with check`; update: `using` and `with check`). Child tables also check that the parent row belongs to the user in `with check`, e.g. `cards`: `exists (select 1 from decks d where d.id = deck_id and d.user_id = (select auth.uid()))`. Otherwise a user could attach rows to another user's deck.
- Produces function `public.consume_generation_quota(p_source_id uuid, p_limit int default 3) returns boolean`, `security invoker`, `set search_path = ''`. In one statement it: returns true if `sources.quota_consumed_at` is already set for that (own) source; otherwise upserts today's `quota_usage` row (`day = (now() at time zone 'utc')::date`), incrementing `generations` only while `< p_limit`. If it incremented, it sets `quota_consumed_at = now()` and returns true; otherwise false. Because it runs as invoker, add insert and update policies on `quota_usage` for the own row, but grant them only through this function: `grant execute on function ... to authenticated` and `revoke insert, update on quota_usage from authenticated`. **Ruling for the implementer:** if invoker rights cannot write `quota_usage` without the table grant, move the function to schema `private` as `security definer` with an explicit `auth.uid()` ownership check on `p_source_id`, and call it through a thin `public` invoker wrapper. Ledger whichever path you take. The point is that a user must not be able to reset their own counter with a direct UPDATE.
- `Card` zod schema gains `importance: z.union([z.literal(1), z.literal(2), z.literal(3)])`. `cardGeneratePrompt` gains the line "importance: 3 = core concept likely on an exam, 2 = supporting, 1 = detail."

- [ ] **Step 1: Write the failing tests**

```ts
test('user cannot insert a card into another user deck', ...);           // A inserts card with deck_id of B's deck → error
test('user cannot read another user chunks', ...);
test('quota: three sources consume, the fourth returns false', ...);
test('quota: calling twice for the same source consumes once', ...);
test('user cannot update quota_usage directly', async () => {
  const { error, data } = await A.client.from('quota_usage').update({ generations: 0 }).eq('user_id', A.userId).select();
  expect(error ?? (data?.length === 0)).toBeTruthy();
});
test('discard_reason outside the enum is rejected', ...);
// schemas.test.ts
test('Card requires importance 1..3', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test:db` and `npx vitest run tests/llm/schemas.test.ts` → relations missing; importance test fails.

- [ ] **Step 3: Write the migration, push it, run the advisors** (as in 1a-1 Task 2). Update `Card` and the prompt; update the Phase 0 eval fixtures (`tests/eval/runEval.test.ts` `cardData`) to include `importance`.

- [ ] **Step 4: Run, expect PASS** — `npm test` and `npm run test:db` → all passed; advisors clean.

- [ ] **Step 5: Commit** — `git commit -m "feat: study content tables, RLS, and per-source generation quota"`

---

### Task 2: Browser text extraction and page chunking

**Files:**
- Create: `src/chunk.ts` (move `chunkByWords` from `eval/runEval.ts`; `eval/runEval.ts` imports it from here)
- Create: `src/lib/import/pdf.ts`
- Test: `tests/chunk.test.ts` (move the existing `chunkByWords` test from `tests/eval/runEval.test.ts`), `tests/lib/pdf.test.ts`

**Interfaces:**
- Produces:
```ts
// src/chunk.ts (no Node APIs)
export function chunkByWords(text: string, maxWords: number): string[];
export interface PageText { page: number; text: string }
export interface Chunk { position: number; pageStart: number; pageEnd: number; text: string }
export function chunkPages(pages: PageText[], maxWords: number): Chunk[];   // keeps page order; a chunk never splits a page unless the page alone exceeds maxWords
export const CHUNK_WORDS = 1500;   // [call] smaller than Phase 0's 3000 so cards stream sooner and stay within free-tier output limits
export function wordCount(text: string): number;
// src/lib/import/pdf.ts (browser only)
export async function extractPdfPages(file: File): Promise<PageText[]>;   // pdfjs-dist getDocument → getTextContent per page, items joined with spaces, hasEOL → '\n'
export function hasTextLayer(pages: PageText[]): boolean;                  // true when total wordCount ≥ 20
```
- The pdf.js worker loads via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.

- [ ] **Step 1: Write the failing tests**

```ts
test('chunkPages packs whole pages and records page ranges', () => {
  const pages = [{ page: 1, text: 'a '.repeat(600) }, { page: 2, text: 'b '.repeat(600) }, { page: 3, text: 'c '.repeat(600) }];
  expect(chunkPages(pages, 1500).map((c) => [c.position, c.pageStart, c.pageEnd])).toEqual([[0, 1, 2], [1, 3, 3]]);
});
test('a single page over maxWords splits into consecutive chunks on that page', ...);
test('empty pages are skipped', ...);
test('hasTextLayer false for a scanned PDF (all pages empty)', () =>
  expect(hasTextLayer([{ page: 1, text: '' }, { page: 2, text: ' ' }])).toBe(false));
test('extractPdfPages reads text from a tiny fixture PDF', ...);   // tests/fixtures/two-pages.pdf, generated once and committed; jsdom + pdfjs legacy build
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/chunk.test.ts tests/lib/pdf.test.ts` → module not found.

- [ ] **Step 3: Implement.** Use the pdfjs `legacy` build in the test environment if the modern build needs browser-only globals. Ledger it.

- [ ] **Step 4: Run, expect PASS** — `npm test` → all passed (the eval tests still pass after the move).

- [ ] **Step 5: Commit** — `git commit -m "feat: browser PDF text extraction and page-aware chunking"`

---

### Task 3: Import screen and createSource action

**Files:**
- Create: `src/app/(app)/study/import/page.tsx`, `src/app/(app)/study/import/actions.ts`, `src/lib/import/validate.ts`
- Test: `tests/lib/import-validate.test.ts`, `tests/db/create-source.test.ts`, `tests/app/import.test.tsx`

**Interfaces:**
- Consumes: `chunkPages`, `wordCount`, `CHUNK_WORDS` (Task 2); tables (Task 1).
- Produces:
```ts
// validate.ts
export const MAX_PAGES = 20;
export const MAX_WORDS = 12_000;
export type ImportInput = { deckId?: string; newDeckTitle?: string; examDate?: string; title: string; kind: 'pdf' | 'text'; pages: PageText[] };
export function validateImport(i: ImportInput): { ok: true } | { ok: false; error: string };
// actions.ts
export async function createSource(i: ImportInput): Promise<{ ok: true; sourceId: string } | { ok: false; error: string }>;
//   re-validates on the server (trust boundary), creates the deck when newDeckTitle is given,
//   inserts the source (page_count = pages.length for pdf, ceil(words/500) for text) and its chunks.
```
- Error copy:
  - `"Pick up to 20 pages at a time."`
  - `"That's about N words. The limit is 12,000 at a time; split it into smaller parts."`
  - `"This PDF has no selectable text. Paste the text instead; photo import comes later."`
  - `"Choose a deck or name a new one."`
- Screen (brief B-S2): a file picker accepting `.pdf` (drag-and-drop on desktop), a "Paste text" textarea, the deck picker (existing decks plus "New deck…"), and an optional exam date. A PDF over 20 pages shows a page-range selector ("Pages from … to …") before submit. Submit "Make flashcards" goes to `/study/triage/<sourceId>` on success.

- [ ] **Step 1: Write the failing tests**

```ts
test('100,000-word paste is rejected with the word count', () => {
  const r = validateImport({ newDeckTitle: 'Bio', title: 't', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(100_000) }] });
  expect(r).toEqual({ ok: false, error: "That's about 100,000 words. The limit is 12,000 at a time; split it into smaller parts." });
});
test('21 pdf pages rejected', ...);
test('scanned pdf rejected with the no-text message', ...);
test('neither deckId nor newDeckTitle is rejected', ...);
// db
test('createSource stores chunks with positions 0..n-1 and does not consume quota', ...);
test('createSource with another user deckId fails', ...);
// app
test('import form shows the word-limit error without calling createSource', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` → modules not found.

- [ ] **Step 3: Implement.** Today's "Import material" link (1a-1 Task 6) now resolves.

- [ ] **Step 4: Run, expect PASS** — `npm test` and `npm run test:db` → all passed.

- [ ] **Step 5: Commit** — `git commit -m "feat: import screen with server-validated source creation"`

---

### Task 4: Generation route

**Files:**
- Create: `src/app/api/generate/route.ts`, `src/lib/generate/generate-chunk.ts`
- Test: `tests/lib/generate-chunk.test.ts`, `tests/db/generate-route.test.ts`

**Interfaces:**
- Consumes: `complete`, `AllProvidersFailedError` (Phase 0); `cardGeneratePrompt`, `CardGenerate`; `isGrounded`; `consume_generation_quota` (Task 1).
- Produces:
```ts
// generate-chunk.ts — pure orchestration, Supabase client and completeFn injected for tests
export type CardRow = { id: string; deck_id: string; source_chunk_id: string | null; type: 'basic' | 'cloze' | 'why'; front: string;
  back: string; key_points: string[]; source_quote: string; concept: string; bloom_level: string; importance: 1 | 2 | 3;
  status: 'pending' | 'kept' | 'discarded'; page_start: number | null };   // cards row (no embedding) + page_start from its chunk, for the "From page N" snippet
export type GenerateResult =
  | { ok: true; cards: CardRow[]; droppedUngrounded: number; alreadyGenerated: boolean }
  | { ok: false; status: 404 | 429 | 503; error: 'not_found' | 'quota' | 'busy'; message: string };
export async function generateChunk(db: SupabaseClient, userId: string, sourceId: string, position: number,
  env: Record<string, string | undefined>, completeFn?: typeof complete): Promise<GenerateResult>;
// route.ts
export async function POST(req: NextRequest): Promise<NextResponse>;   // body {sourceId: uuid, position: int ≥ 0} validated with zod → 400 on bad body; 401 without claims
```
- `generateChunk` order:
  1. Load the chunk via the user's RLS client. Not found means 404, with no LLM call.
  2. If `generated_at` is set, return the existing cards for that chunk with `alreadyGenerated: true`.
  3. Call `consume_generation_quota(sourceId)`. False means 429 with "You've used today's 3 card generations. They reset at midnight UTC."
  4. Call `complete('card_generate', cardGeneratePrompt({chunk: text, subject: deck.subject ?? 'general', level: 'college'}), CardGenerate, { env })`, keeping the router's default `requireNoTraining: true`.
  5. Keep cards where `isGrounded(chunk.text, card.source_quote)`; count the rest.
  6. Insert the kept cards as `pending` with `source_chunk_id`, and set `generated_at = now()`.
  7. Insert one `llm_calls` row per log entry. On `AllProvidersFailedError`, log the calls too, then return 503 with "The AI service is busy. Your material is saved; try again in a few minutes."

- [ ] **Step 1: Write the failing tests** (fake `completeFn`; fake `db` for unit tests, real dev DB for the route test)

```ts
test('ungrounded card is dropped and counted', ...);                   // droppedUngrounded 1, cards 1
test('retry after busy does not consume quota twice', ...);            // first call 503 after quota consumed; second call ok; quota_usage.generations === 1
test('already generated chunk returns existing cards without an LLM call', ...);
test('another user sourceId gives 404 and no completeFn call', ...);
test('fourth source of the day gives 429 with the quota message', ...);
test('llm_calls rows are written for success and failure', ...);
test('POST with a non-uuid sourceId is 400', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` and `npm run test:db` → modules not found.

- [ ] **Step 3: Implement.** The route reads keys from `process.env` and never returns provider messages to the client.

- [ ] **Step 4: Run, expect PASS** — both suites pass. A manual run with `GROQ_API_KEY` set: import the eval sample doc and get at least 3 grounded cards.

- [ ] **Step 5: Commit** — `git commit -m "feat: per-chunk card generation route with grounding and quota"`

---

### Task 5: On-device duplicate detection

**Files:**
- Create: `src/lib/embed/embed.ts`, `src/lib/embed/duplicates.ts`
- Test: `tests/lib/duplicates.test.ts`

**Interfaces:**
- Produces:
```ts
// embed.ts (browser) — lazy singleton pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {dtype:'q8'}), mean-pooled + normalized
export type EmbedFn = (texts: string[]) => Promise<number[][]>;
export function getEmbedder(): Promise<EmbedFn | null>;   // null when the model fails to load (offline, low memory); callers skip dedupe
// duplicates.ts (pure)
export function cosine(a: number[], b: number[]): number;
export const DUPLICATE_THRESHOLD = 0.9;
export function findDuplicates(newCards: { id: string; embedding: number[] }[], existing: { id: string; embedding: number[] }[],
  threshold?: number): string[];   // ids of new cards that duplicate an existing card or an earlier new card; first occurrence wins
```
- `ponytail:` dedupe runs on the device and is skipped when the model can't load. Cards are then kept, not lost. Move it to pgvector on the server if decks grow past a few thousand cards.

- [ ] **Step 1: Write the failing tests**

```ts
test('cosine of identical vectors is 1 and of orthogonal is 0', ...);
test('new card matching an existing one is flagged', ...);
test('two near-identical new cards: only the second is flagged', ...);
test('below threshold is not flagged', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/lib/duplicates.test.ts` → module not found.

- [ ] **Step 3: Implement.** `getEmbedder` catches load errors and returns null. The model files download once and are cached by the browser (transformers.js cache).

- [ ] **Step 4: Run, expect PASS** — the test file passes.

- [ ] **Step 5: Commit** — `git commit -m "feat: on-device near-duplicate card detection"`

---

### Task 6: Triage screen

**Files:**
- Create: `src/app/(app)/study/triage/[sourceId]/page.tsx`, `src/app/(app)/study/triage/[sourceId]/triage.tsx` (client), `src/app/(app)/study/triage/actions.ts`
- Test: `tests/app/triage.test.tsx`, `tests/db/triage-actions.test.ts`

**Interfaces:**
- Consumes: `POST /api/generate` (Task 4), `getEmbedder`, `findDuplicates` (Task 5).
- Produces:
```ts
// actions.ts
export async function setCardStatus(ids: string[], status: 'kept' | 'discarded', reason?: 'trivial' | 'wrong' | 'duplicate' | 'unclear'): Promise<void>;
export async function editCard(id: string, patch: { front?: string; back?: string }): Promise<void>;   // trims; rejects empty strings
export async function saveEmbeddings(rows: { id: string; embedding: number[] }[]): Promise<void>;
```
- Behaviour (brief B-S3, B2.5; spec §8.2 Triage):
  - On load, request every chunk without `generated_at` in order, one at a time. Cards append as each response arrives. A progress line reads "Making cards… part 2 of 5".
  - Each card shows its type label ("Q&A", "Fill in the blank", "Why"), front, back, a source snippet ("From page 3: …"), and an Edit button.
  - Card stack on every screen size. Controls: "Keep" (→ key), "Discard" (← key), "Edit" (E key), each also a visible button. Discard asks for an optional reason through chips: "Too trivial", "Wrong", "Duplicate", "Unclear".
  - Footer: "Keep all" (keeps every pending card) and "Done reviewing", which goes to `/study`.
  - After each batch, run duplicate detection against the deck's kept and pending cards and the batch. Mark duplicates discarded with reason `duplicate` and announce the count in a polite live region: "Skipped 2 duplicates."
  - Error states (brief B5.5): 429 shows the quota message with a link back to Study. 503 shows the busy message, a "Try again" button that resumes from the first ungenerated chunk, and any cards already made stay. Zero kept cards in a chunk is not an error.
  - Every card move is announced to screen readers ("Kept. 4 left.").

- [ ] **Step 1: Write the failing tests** (mock `fetch` for `/api/generate`, mock the actions)

```ts
test('cards from two chunks appear in order and progress reads part 2 of 2', ...);
test('ArrowRight keeps the current card and announces it', ...);
test('Discard with the Wrong chip sends reason wrong', ...);
test('503 keeps existing cards and Try again resumes at the failed chunk', ...);
test('429 shows the quota message', ...);
test('Keep all keeps every pending card', ...);
// db
test('setCardStatus cannot change another user cards', ...);
test('editCard rejects an empty front', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npm test` → modules not found.

- [ ] **Step 3: Implement** to `DESIGN.md`.

- [ ] **Step 4: Run, expect PASS** — `npm test` and `npm run test:db` → all passed; `npm run build` → succeeds. Run the Impeccable detector once over the new screens and fix what it reports.

- [ ] **Step 5: Commit** — `git commit -m "feat: streaming triage with keep, discard, edit, and dedupe"`
