# Progress

Handoff for the next session. Update it at the end of each session. Last updated 2026-10-25.

## State
- `main` has everything through PR #40. PR #38 (2026-10-25): the sign-in code field takes 6–8 digits, since Supabase can send longer codes. PR #18 removed feedback translation and the first-language question (English only), and PR #20 dropped their schema (`scholar.item_translations` and `profiles.first_language`; both were empty). PR #19 writes the time zone cookie on every page. PR #21 lets a stopped timer be resumed. PR #23 (from the 2026-10-24 completeness review) adds data export and delete, "Report a problem", and a daily keep-alive. On `main`: 597/597 unit tests, 190/190 DB tests, typecheck and the production build pass.
- PR #26 (2026-10-24, plan and rulings: `docs/superpowers/plans/2026-10-24-small-gaps.md`) closed the small gaps: limit messages say how long until they reset instead of "midnight UTC"; Recall imports Word (.docx) files; problem reports keep a copy of the reported text (`problem_reports.snapshot`, filled in by a database trigger so it can't be faked).
- PR #28 (second completeness review, against the brief; plan and rulings: `docs/superpowers/plans/2026-10-24-brief-gaps.md`): Today's empty state offers both tools; non-English essays are refused before any AI call; a public `/privacy` notice (**owner reviews the wording**); math renders in cards (KaTeX); new cards per day and target retention are settings; import offers Fewer/Standard/More cards, and generation learns from the student's discards; triage has "Improve this card". Essays stay capped at 2,000 words (ruling: Groq's free tier allows 8,000 tokens a minute). Reviewed with `/code-review high --fix`; findings fixed or ruled on in the plan. 
- PR #30 (third completeness review: screens, states, pipelines, metrics; plan: `docs/superpowers/plans/2026-10-24-round3-gaps.md`): swipe in triage; Top 5 after three priorities addressed in a row (J5); growth snapshot on Write; hints start at 2 for a recurring weakness (J7); "Suggest a rewrite" in the deck editor; weekly activity on Today; `docs/metrics.sql` (Part F queries, all checked against the database); a poem submitted as an essay asks first; students can score essays against their own rubric; import can choose card types. Reviewed with `/code-review high --fix`; findings fixed or ruled on in the plan. 
- PR #32 (fourth completeness review; plan and rulings: `docs/superpowers/plans/2026-10-24-round4-gaps.md`): AI-made cards are labelled; Today explains the daily new-card limit; the import page shows card generations left; the essay coach's big-picture pass knows the student's recurring patterns. Ruled: no separate tone pass (free-tier tokens), card help covered by the card's report, no "waking up" message (the keep-alive prevents pauses). No PRs are open.
- PR #37 (Phase 2d, free-tier subset, owner decision 2026-10-24; plan: `docs/superpowers/plans/2026-10-24-phase2d-free-subset.md`): apply, compare and order card types; "Ask it another way" in review (one cached call per card); Feynman mode from the mastery map; photos of notes and handwritten essays read on the device (Tesseract.js); spoken answers in review turned into text on the device (Whisper tiny). The privacy notice covers photos and voice. Still waiting on capacity: argument map, citation checker, reader personas, voice preservation.
- PR #40 (review formats, 2026-10-25; idea: `docs/ideas/review-formats.md`, plan and rulings: `docs/superpowers/plans/2026-10-25-review-formats.md`): review picks a format per card from its FSRS state: multiple choice for new and relearning cards, fill in the blank for learning or weak cards, reverse (answer → question) for strong basic cards every third review, typed recall otherwise. Easier formats are capped (choice at most Hard, blank at most Good), in the UI and in the database. A warm-up round (`/study/warm-up`) mixes true or false with matching and never touches the schedule. No LLM calls. `docs/metrics.sql` has a by-format query.
- PR #41 (redesign, 2026-10-25; Impeccable direction round, seed 7144af7c, re-roll 1; brief: `.impeccable/surfaces/src-app-app-today-page-tsx.md`; system: `DESIGN.md`): the app's universal theme is now **Mixtape J-Card**: ballpoint blue on white inlay stock, one red accent (current tab, A/B side letters, the stripe), hand-lettered caps (Patrick Hand) for headings only, Atkinson for everything read, ink-framed `.inlay` panels, 4 px corners, ink double-outline focus. Today is a J-card: side A review, side B essays with the minutes left, and a two-part tape against the daily minutes. Finish review: 7 of 8 fixes resolved, the last one fixed after. Not yet reviewed under the new theme: Write, Progress, Profile, triage, warm-up, practice test and onboarding screens, and dark mode outside Today.
- PR #42 (motion and texture for the J-card theme, 2026-10-25; Impeccable bolder + animate): Today's "press play" (side letters stamp in, side A fills, side B spools while two cassette reels turn, all once), review and warm-up cards slide in like an inlay, an ink underline is drawn under "Right." / "Not quite.", buttons press 1px, a paper-fibre grain on the page ground, a bigger page heading on a doubled ink rule, and the inlay's A | B label block at the foot of the desktop spine. CSS only; reduced motion lands on the final frame. `DESIGN.md` records the new rules.
- All migrations through `20261025120000_scholar_review_formats.sql` are applied (2026-10-25), and the advisors show nothing for `scholar`.
- `20261024130000_scholar_anon_ping.sql` grants anon `usage` on schema `scholar` so the keep-alive cron can call `ping()`. Anon has no table or column grants there and `ping` is its only executable function, so **every new scholar function must keep revoking execute from public**.
- `graphify-out/` (local, gitignored) was rebuilt on 2026-10-24, and git hooks rebuild it after each commit (code only).

## What's built
- **Draft Coach**:
  - feedback in three layers (global, paragraph, sentence via LanguageTool), English essays only (checked before any AI call);
  - photos of handwritten essays read on the device;
  - the student's own rubric (or the default), Top 5 after three priorities addressed in a row, hints that start at 2 for a recurring weakness, and a check before analysing a poem as an essay;
  - a growth snapshot on the Write page, and a big-picture pass that knows the student's recurring patterns;
  - a hint ladder, "I disagree" and questions on a feedback item;
  - an outline, a self-assessment, read-aloud and timed writing;
  - a growth profile.
- **Recall**:
  - cards from PDFs, from the AI, or written by hand; AI grading and card help;
  - FSRS reviews with confidence ratings;
  - a mastery map, exam mode and a Today plan in the student's own time zone;
  - Word (.docx) import, CSV and Anki (.apkg) import, CSV export;
  - Fewer/Standard/More cards per import, generation that learns from discards, and "Improve this card" in triage;
  - math in cards (KaTeX, loaded only when a card has math);
  - apply, compare and order card types; "Ask it another way"; Feynman mode; photos of notes read on the device; spoken answers;
  - review formats chosen per card (multiple choice, fill in the blank, reverse, typed) with rating caps, and a warm-up round with true or false and matching;
  - settings for new cards per day and target retention;
  - swipe to keep or discard in triage, card types chosen on import, and "Suggest a rewrite" in the deck editor;
  - weekly activity on Today, with a note when new cards wait beyond the daily limit;
  - "Made by AI from your notes" on generated cards, and card generations left shown before importing;
  - course goals (matched on the device) and prerequisites with suggestions when a concept keeps being missed.
- **Shared**:
  - Profile → "Your data": download everything as one JSON file (built in the browser through RLS), or delete all Scholar data (typed confirmation, clears the device, signs out);
  - "Report a problem" in the review session and on each feedback card (`scholar.problem_reports`; the owner reads them with SQL);
  - a daily Vercel cron to `/api/keep-alive`, so the free Supabase project doesn't pause;
  - a public privacy notice at `/privacy`, linked from sign-in, onboarding and Profile;
  - `docs/metrics.sql`: read-only queries for the brief's success metrics (Part F), to run in the Supabase SQL editor.

## Owner decisions (October 2026)
The brief's Part K decision log (`ai-learning-platform-brief.md`) lists these and the builder's rulings with reasons and alternatives; add new ones in both places.

- Students only: no teacher, class or school features.
- Free-tier AI only: no paid models. Phase 2d is built only where it runs on the device or costs one cached call per student action (2026-10-24); the per-essay features wait for a capacity decision.
- Hosting is prep only: `docs/deploy.md` is the Vercel Hobby checklist, and the owner deploys.
- English only: no translation and no other essay or card languages.
- Deleting data never deletes the shared `auth.users` row; `quota_usage` and `llm_calls` survive a delete so it can't reset the day's limits (2026-10-24).
- Merging: the owner granted Claude full permission for this project (2026-10-24, Part K #14): Claude merges its own PRs after the checks pass, then deletes the branch locally and on GitHub.

## Next steps
1. **Brief gaps:** closed or ruled on in `docs/superpowers/plans/2026-10-24-brief-gaps.md`. **Small gaps:** none open. Ruled on in `docs/superpowers/plans/2026-10-24-small-gaps.md`: daily limits stay on the UTC day (a local day could be gamed by changing time zone), failed AI calls are not queued (nothing is lost; a queue needs a worker that Hobby can't run often enough), and a magic link opened in another browser keeps the layout's one refresh.
2. **Waiting on the owner:**
   - tune `GOAL_MATCH = 0.5` (`src/review/goals.ts`) once real course material exists;
   - import a real deck exported from current Anki (WAL mode and multi-frame zstd are unverified);
   - deploy per `docs/deploy.md`, including custom SMTP for sign-in emails; after deploying, check `/api/keep-alive` answers `{"ok":true}` and the cron shows in Vercel;
   - review the wording of `/privacy` (the brief recommends a legal review before launch), and add a contact address for removing a sign-in;
   - try "Your data", "Report a problem", the Word import, math in cards and "Improve this card" in a browser (not checked yet);
   - get feedback from beta students before new features.

## Gotchas
- Browser-only libraries (pdf.js, sql.js) are aliased to `src/lib/server-stub.ts` in `next.config.ts` and must be loaded with a lazy `await import()`. A static import breaks the build.
- PostgREST returns at most 1,000 rows: page with `allRows` (`src/lib/cards/transfer.ts`).
- Server action bodies are limited to 1 MB, which is why Anki cards are sent in batches of 500.
- `.superpowers/qa/session.mts` (local, gitignored) was fixed on 2026-10-24: it still wrote the dropped `first_language` column and ignored the error, so its user never onboarded.
- Browser QA:
  - run a production build on port 3200;
  - make a QA user with `node --env-file=.env.local --experimental-strip-types .superpowers/qa/session.mts`, using `@example.test` emails only;
  - delete the user and its token files afterwards.
- There is no lint script. The checks are `npx tsc --noEmit`, `npm test` and `npm run build`; `npm run test:db` hits the real Supabase project.
