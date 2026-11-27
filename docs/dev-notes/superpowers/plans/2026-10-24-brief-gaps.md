# Gaps from the second completeness review (brief A2, B2, C, E)

**Goal:** close the gaps found when checking the code against the brief's own feature list, or rule on them.

## Global constraints
- Free and open-source only; pin exact versions (`npm i -E`).
- A prompt change re-runs the eval and adds a row to `docs/superpowers/notes/2026-10-21-token-budget.md`. System prompts stay static: per-request lines go in the user message, and only when they apply (the timed-writing precedent), so default calls are unchanged.
- Migrations touch only `scholar` / `scholar_private`; advisors after applying.

## Tasks
1. **A new student can start either tool (C4).** Today's empty state offers "Get feedback on an essay" as well as "Turn notes into flashcards". Commit: `feat: Today's empty state offers both tools`.
2. **English-only check (A7).** An essay that isn't English is refused before any AI call, with a plain message. A deterministic function-word check (`src/lib/essay/english.ts`), shared by the form and the server. Commit: `feat: refuse essays that aren't in English`.
3. **Privacy notice (E4).** A public `/privacy` page that says what is stored, which AI providers see what, how long data is kept, and how to export or delete it, written from what the code does. Linked from sign-in, onboarding and Profile. **The owner reviews the wording (legal review recommended by the brief).** Commit: `feat: privacy notice`.
4. **Math in cards (B7).** KaTeX renders `\(…\)`, `\[…\]`, `$$…$$` and `$…$` (Pandoc's rule, so "$5 and $10" stays text) on card fronts and backs, with MathML for screen readers. KaTeX loads only when a card has math. Commit: `feat: render math in cards`.
5. **Study settings (B2.6).** New cards per day (5–100, default 20) and target retention (80–97%, default 90%) in Profile → Change preferences, stored in `profiles.preferences`. The review session, the Today plan and offline regrades use them. Commit: `feat: adjustable new cards per day and target retention`.
6. **Card density and discard signal (B2.2, B2.5).** The import form has Fewer / Standard / More (`sources.card_density`). Card generation adds one user-message line for Fewer or More, and one line when the student mostly discards one kind of card. Standard calls without a discard pattern are unchanged. Eval run and ledger row. Commit: `feat: fewer or more cards, and generation learns from discards`.
7. **Improve this card (B2.5).** In triage, "Improve" asks for a rewrite under the card rules, grounded in the same source passage. The student keeps theirs or uses the suggestion. New task `card_improve`, from the 60-a-day helper calls. Eval run and ledger row. Commit: `feat: improve a card in triage`.
8. **Rulings and PROGRESS.md.** Commit: `docs: rulings and PROGRESS.md for the brief gaps`.

Tasks 6 and 7 share `src/llm/prompts.ts` and were measured together, so they landed as one commit: `feat: fewer or more cards, discard signal, and improve a card in triage`.

## Review (`/code-review high --fix`) and follow-ups
- **Fixed by the review:**
  - An "Improve" answer that arrives after the student has moved on, or started editing, is dropped. Before, it opened on the next card and Save overwrote that card (regression test added).
  - The "Suggested rewrite" banner no longer shows over the student's own text.
  - Missed answers in practice-test results render math.
  - Once KaTeX has loaded, new cards render math straight away.
  - The profile page uses the scheduler's defaults.
- **Fixed after the review:**
  - Study settings are checked when read (`studySettings`), since the user can write the preferences column directly; out-of-range values fall back to the defaults.
  - The discard signal ignores "duplicate": triage's on-device dedupe records that reason automatically, so it isn't the student's choice.
- **Not changed:**
  - The discard query runs once per chunk. It's one small indexed read next to a multi-second LLM call.
  - `/api/cards/improve` mirrors `/api/cards/help`. Merging them means refactoring the help route, which is outside this work.
  - The onboarding form keeps 20 and 0.9 literally, because importing the scheduler would pull ts-fsrs into that page's bundle.

## Rulings
- **Essays stay capped at 2,000 words (A7 asks for chunking up to 5,000).** A 5,000-word essay is roughly 7,000 input tokens for the big-picture pass alone, before the schema and the output. Groq's free tier allows 8,000 tokens a minute on `openai/gpt-oss-120b` (hit and measured on 2026-10-24 while probing card generation), so one long essay check would use nearly all of it and block other students. The paragraph pass would also need chunking, which this note's ledger shows costs quality when context is cut. Revisit with a paid or larger free tier.
