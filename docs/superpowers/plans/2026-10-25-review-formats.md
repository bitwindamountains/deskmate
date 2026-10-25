# Review formats

**Goal:** more ways to answer a card in review (multiple choice, fill in the blank, reverse, and a true/false and matching warm-up) without inflating FSRS. Idea and trade-offs: `docs/ideas/review-formats.md`. Every format is built on the device from the card's front, back, key points, concept and FSRS state: **no new LLM calls**, so no token-budget ledger rows.

## Global constraints
- CLAUDE.md's hard rules. No new dependencies.
- Format choice and question building are pure functions in `src/review/formats.ts`, tested in `tests/review/formats.test.ts`. Randomness uses the seeded PRNG already in `src/review/practice-test.ts` (move `random` and `shuffle` to `formats.ts` and import them back, so there is one copy).
- **Rating caps** (the reason this is safe): a right multiple-choice answer is at most Hard; a right blank at most Good; typed and reverse keep all four ratings. A wrong answer in any format suggests Again. Rating buttons above the cap are not shown.
- The student can switch a card to a harder format ("Type it instead"), never an easier one.
- Keyboard: options are radio buttons (arrow keys, Enter to check); the existing 1–4 rating shortcuts keep working. Color is never the only sign of right or wrong: the result line says "Right" or "Not quite — the answer is …".
- Offline review keeps working: formats are built from the cached card (`CachedCard` in `src/review/store.ts`); multiple-choice distractors come from the other cards in the same session queue.
- Migrations only in `scholar` / `scholar_private`; DB tests and advisors after applying; name the migration in the PR.

## Format ladder
`chooseFormat(card, pool)` returns `'choice' | 'blank' | 'typed' | 'reverse'`:
- `choice` when the card is new (`state` null or 0) or relearning (`state` 3), its type is basic or cloze (explain-type answers, application included, make giveaway options, as in the practice test), and `pool` gives 3 distinct distractors.
- `blank` when the card is learning (`state` 1) or its stability is under 7 days, and a key point appears word for word in the back (case-insensitive).
- `reverse` for a basic card in review state (`state` 2) on every third review (`reps % 3 === 2`), when its back is short (12 words or fewer) so it reads as a prompt.
- otherwise `typed` (today's behaviour). Each step falls through to the next when its condition fails, so every card always has a format.

## Tasks
1. **Formats module.** `src/review/formats.ts`: `chooseFormat`, `buildChoice` (distractors first from cards on the same concept, then the rest of the pool, skipping answers equivalent to the right one, the `same()` rule from `practice-test.ts`), `buildBlank` (the longest key point found in the back becomes `_____`; returns the sentence and the expected words), `checkBlank` (uses `normalizeAnswer` and `similarity` from `src/review/grade.ts`; right at 0.85 or more), and `capRating(format, grade)`. Tests first: each ladder branch and its fall-through, no distractor equal to the answer, a deck too small for choice, a blank whose key point differs only in case, the caps. Commit: `feat: choose a review format per card`.
2. **Record the format.** Migration `<timestamp>_scholar_review_formats.sql`: widen `scholar.reviews.grade_source` to also allow `'choice'`, `'blank'` and `'reverse'`, and `create or replace` `scholar_private.record_review` (latest version in `20261022120000_scholar_recall_depth.sql`) with the same widened list; nothing else in it changes, and execute stays revoked from public. Widen `ReviewPayload['grade_source']` in `src/review/store.ts`. DB test in `tests/db/`: each new source is accepted, an unknown one is still refused. Add a by-format breakdown to the `grade_source` query in `docs/metrics.sql`. Commit: `feat: record which format a review used`.
3. **Multiple choice and fill in the blank in review.** `src/app/(app)/study/review/session.tsx` builds the format when a card comes up. Choice shows the options as radio buttons; blank shows the sentence with one input. Both are checked on the device (no `requestGrade` call), go straight to the rate phase with the suggested rating, and show only the ratings the cap allows. A muted line says why ("New card: pick from the options first"). "Type it instead" switches to typed recall. "Ask it another way", the microphone and "Show answer" stay on typed only. Component tests in `tests/app/`: choice right → Hard suggested and no Good or Easy button; choice wrong → Again; blank right → Good; "Type it instead" shows the textarea; no `requestGrade` call for either format. Commit: `feat: multiple choice and fill in the blank in review`.
4. **Reverse cards.** Show the back as the prompt and ask "What's the question?"; "Show answer" reveals the front and the student rates themselves (all four ratings, `grade_source: 'reverse'`). Component test. Commit: `feat: reverse cards in review`.
5. **Warm-up round.** `/study/warm-up` (linked from the Study page next to Review): up to 10 cards from the student's kept cards, mixing true/false (the card's own answer or a distractor, so about half are false; a false one shows the right answer after) and one matching set of 4 (tap a question, then its answer; works with the keyboard). It writes nothing: no review rows, no FSRS state. The end screen says how many were right and offers "Start review". Pure builders in `formats.ts` with tests; a component test that nothing calls `recordReview`. Commit: `feat: warm-up round with true or false and matching`.
6. **PROGRESS.md, review.** Run `/code-review high --fix`, record findings and rulings in this plan, update PROGRESS.md and run `/graphify --update`.

## Review focus
- The caps hold everywhere a rating is made: buttons, the 1–4 shortcuts, and the offline outbox.
- No distractor is the right answer in other words; a card with no valid distractors never gets choice.
- The warm-up never writes to `scholar.reviews` or `card_states`.
- Tab order and screen-reader labels for options, the blank input and matching.
- The format doesn't change mid-card on a re-render (seed by card id and review count).

## Review (`/code-review high --fix`) and follow-ups
- **Fixed by the review:**
  - Multiple-choice options and warm-up wrong answers stay in the card's own deck, so another subject's answer is never a giveaway. Concepts are grouped by `trim().toLowerCase()`, as in interleave and the mastery map.
  - Blanks match whole words only ("cell" no longer blanks the start of "cells").
  - Keyboard focus: reverse cards focus "Show the question"; matched warm-up buttons stay focusable (`aria-disabled`); True and Next take focus in the warm-up.
  - The format, options and blank are memoized, so typing doesn't rescan the deck on every key.
- **Fixed after the review:**
  - "Type it instead" leaked the answer: the options or the blank's sentence were already on screen. The switched card keeps the cap of what was shown (Hard after options, Good after a blank), is graded on the device only (so an offline regrade can't lift it past the cap), and is recorded under that format.
  - The warm-up uses basic and cloze cards only: paragraph answers next to one-word ones gave every item away.
- **Ruled:** the warm-up keeps using `loadStudy` (2–3 extra small queries per load). A cards-only loader would duplicate it for little gain; revisit if the page is slow.
