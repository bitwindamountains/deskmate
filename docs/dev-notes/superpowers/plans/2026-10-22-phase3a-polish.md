# Phase 3a Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the eight minors deferred from the 3a review (PR #9): import messages and edge cases, export filenames, and the timer.

**Architecture:** In-place fixes. No migration and no LLM change.

**Spec:** `ai-learning-platform-brief.md` B4.5 and A4.5, plus the 3a plan's Global Constraints.

## Review Focus
1. **Importing the same file twice.** Expect the second import to add nothing and say so.
2. **A semicolon-separated CSV from a European Excel.** Expect it to import like a comma one.
3. **A student who stops the timer, then keeps editing for an hour before submitting.** Expect the minutes used at the stop.

### Task 1: Import (`src/lib/cards/csv.ts`, `src/lib/cards/transfer.ts`, `transfer.tsx`)
- **Delimiter:** the header row decides it. Use `;` when the header has more `;` than `,` outside quotes.
- **Apostrophe prefixes:** one leading `'` in front of `= + - @` is removed on import, which undoes the export's formula guard.
- **Skipped rows:** reported with row numbers (1-based, header = row 1), up to 5 shown: "Skipped rows 3 and 7: a front or back was empty or over 500 characters."
- **Duplicates:** a card whose front and back (trimmed, case-insensitive) already exist in the deck, or earlier in the same file, is not added, and is counted as "already in this deck".
- **Client side:** files over 1 MB are refused before reading, with "Choose a CSV under 1 MB." The file input is reset after each pick, so the same file can be picked again.
- **Interfaces:**
  - `parseCards` returns `{ cards, skippedRows: number[], error? }`;
  - `importCards` returns `{ ok: true; added; skippedRows; duplicates }`.

**Commit:** `fix: clearer, duplicate-safe CSV import`

### Task 2: Export filename (`src/app/api/decks/[deckId]/export/route.ts`)
- `filename*` percent-encodes `'()*` as well (RFC 5987).

**Commit:** `fix: fully encode export filenames`

### Task 3: Timer (`timer.tsx`, `new-essay-form.tsx`)
- **Stop:** a "Stop the timer" button freezes minutes used. While the timer runs, submitting uses the elapsed minutes.
- **Cap:** minutes used are capped at the limit plus 30 minutes.
- **Visibility:** the countdown also shows next to "Get feedback", so it stays in sight on a phone while the student writes.

**Commit:** `fix: stoppable timer with sensible minutes used`
