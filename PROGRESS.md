# Progress

Handoff for the next session. Update it at the end of each session. Last updated 2026-10-24.

## State
- `main` has everything through PR #30. PR #18 removed feedback translation and the first-language question (English only), and PR #20 dropped their schema (`scholar.item_translations` and `profiles.first_language`; both were empty). PR #19 writes the time zone cookie on every page. PR #21 lets a stopped timer be resumed. PR #23 (from the 2026-10-24 completeness review) adds data export and delete, "Report a problem", and a daily keep-alive. On `main`: 552/552 unit tests, 183/183 DB tests, typecheck and the production build pass.
- PR #26 (2026-10-24, plan and rulings: `docs/superpowers/plans/2026-10-24-small-gaps.md`) closed the small gaps: limit messages say how long until they reset instead of "midnight UTC"; Recall imports Word (.docx) files; problem reports keep a copy of the reported text (`problem_reports.snapshot`, filled in by a database trigger so it can't be faked).
- PR #28 (second completeness review, against the brief; plan and rulings: `docs/superpowers/plans/2026-10-24-brief-gaps.md`): Today's empty state offers both tools; non-English essays are refused before any AI call; a public `/privacy` notice (**owner reviews the wording**); math renders in cards (KaTeX); new cards per day and target retention are settings; import offers Fewer/Standard/More cards, and generation learns from the student's discards; triage has "Improve this card". Essays stay capped at 2,000 words (ruling: Groq's free tier allows 8,000 tokens a minute). Reviewed with `/code-review high --fix`; findings fixed or ruled on in the plan. 
- PR #30 (third completeness review: screens, states, pipelines, metrics; plan: `docs/superpowers/plans/2026-10-24-round3-gaps.md`): swipe in triage; Top 5 after three priorities addressed in a row (J5); growth snapshot on Write; hints start at 2 for a recurring weakness (J7); "Suggest a rewrite" in the deck editor; weekly activity on Today; `docs/metrics.sql` (Part F queries, all checked against the database); a poem submitted as an essay asks first; students can score essays against their own rubric; import can choose card types. Reviewed with `/code-review high --fix`; findings fixed or ruled on in the plan. 
- **Branch `round4-gaps`** (fourth completeness review; plan and rulings: `docs/superpowers/plans/2026-10-24-round4-gaps.md`): AI-made cards are labelled; Today explains the daily new-card limit; the import page shows card generations left; the essay coach's big-picture pass knows the student's recurring patterns. Ruled: no separate tone pass (free-tier tokens), card help covered by the card's report, no "waking up" message (the keep-alive prevents pauses).
- All migrations through `20261024170000_scholar_card_types.sql` are applied (2026-10-24), and the advisors show nothing for `scholar`.
- `20261024130000_scholar_anon_ping.sql` grants anon `usage` on schema `scholar` so the keep-alive cron can call `ping()`. Anon has no table or column grants there and `ping` is its only executable function, so **every new scholar function must keep revoking execute from public**.
- `graphify-out/` (local, gitignored) was rebuilt on 2026-10-24, and git hooks rebuild it after each commit (code only).

## What's built
- **Draft Coach**:
  - feedback in three layers (global, paragraph, sentence via LanguageTool), English essays only (checked before any AI call);
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
- Students only: no teacher, class or school features.
- Free-tier AI only: no paid models, and no heavy AI features that need them (Phase 2d).
- Hosting is prep only: `docs/deploy.md` is the Vercel Hobby checklist, and the owner deploys.
- English only: no translation and no other essay or card languages.
- Deleting data never deletes the shared `auth.users` row; `quota_usage` and `llm_calls` survive a delete so it can't reset the day's limits (2026-10-24).
- The owner merges PRs. After a merge, delete the branch locally and on GitHub.

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
- Browser QA:
  - run a production build on port 3200;
  - make a QA user with `node --env-file=.env.local --experimental-strip-types .superpowers/qa/session.mts`, using `@example.test` emails only;
  - delete the user and its token files afterwards.
- There is no lint script. The checks are `npx tsc --noEmit`, `npm test` and `npm run build`; `npm run test:db` hits the real Supabase project.
