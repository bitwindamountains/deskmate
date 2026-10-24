# Progress

Handoff for the next session. Update it at the end of each session. Last updated 2026-10-24.

## State
- `main` has everything through PR #23. PR #18 removed feedback translation and the first-language question (English only). PR #19 writes the time zone cookie on every page. PR #21 lets a stopped timer be resumed. PR #23 (from the 2026-10-24 completeness review) adds data export and delete, "Report a problem", and a daily keep-alive. On `main`: 480/480 unit tests, 175/175 DB tests, typecheck and the production build pass.
- **Open PR #20 `drop-translation-schema`**: the migration `20261023100000_scholar_drop_translation.sql` drops `scholar.item_translations` and `profiles.first_language`. It is **not applied**: the owner reviews it, applies it, then runs the advisors. The data export already skips `item_translations`, so applying it breaks nothing.
- All other migrations through `20261024130000_scholar_anon_ping.sql` are applied, and the advisors show nothing for `scholar`.
- `20261024130000_scholar_anon_ping.sql` grants anon `usage` on schema `scholar` so the keep-alive cron can call `ping()`. Anon has no table or column grants there and `ping` is its only executable function, so **every new scholar function must keep revoking execute from public**.
- `graphify-out/` (local, gitignored) was rebuilt on 2026-10-24, and git hooks rebuild it after each commit (code only).

## What's built
- **Draft Coach**:
  - feedback in three layers (global, paragraph, sentence via LanguageTool);
  - a hint ladder, "I disagree" and questions on a feedback item;
  - an outline, a self-assessment, read-aloud and timed writing;
  - a growth profile.
- **Recall**:
  - cards from PDFs, from the AI, or written by hand; AI grading and card help;
  - FSRS reviews with confidence ratings;
  - a mastery map, exam mode and a Today plan in the student's own time zone;
  - CSV and Anki (.apkg) import, CSV export;
  - course goals (matched on the device) and prerequisites with suggestions when a concept keeps being missed.
- **Shared**:
  - Profile → "Your data": download everything as one JSON file (built in the browser through RLS), or delete all Scholar data (typed confirmation, clears the device, signs out);
  - "Report a problem" in the review session and on each feedback card (`scholar.problem_reports`; the owner reads them with SQL);
  - a daily Vercel cron to `/api/keep-alive`, so the free Supabase project doesn't pause.

## Owner decisions (October 2026)
- Students only: no teacher, class or school features.
- Free-tier AI only: no paid models, and no heavy AI features that need them (Phase 2d).
- Hosting is prep only: `docs/deploy.md` is the Vercel Hobby checklist, and the owner deploys.
- English only: no translation and no other essay or card languages.
- Deleting data never deletes the shared `auth.users` row; `quota_usage` and `llm_calls` survive a delete so it can't reset the day's limits (2026-10-24).
- The owner merges PRs. After a merge, delete the branch locally and on GitHub.

## Next steps
1. **The owner reviews, applies and merges PR #20** (drop the translation schema), then runs the advisors.
2. **Small gaps:**
   - a magic link opened in a different browser than the one used to sign in still lands on `/today` without the time zone cookie, so the `(app)` layout's one refresh covers it;
   - the goal-match threshold `GOAL_MATCH = 0.5` in `src/review/goals.ts` hasn't been tuned on real courses;
   - a report doesn't snapshot the card's text, so a report on a card the student later deletes points at nothing;
   - left from the completeness review: failed AI calls ask the student to retry instead of queueing (spec §6.1, record as a ruling), quotas reset at midnight UTC while everything else is local, and Recall can't import DOCX although Draft Coach can.
3. **Waiting on the owner:**
   - import a real deck exported from current Anki (WAL mode and multi-frame zstd are unverified);
   - deploy per `docs/deploy.md`, including custom SMTP for sign-in emails; after deploying, check `/api/keep-alive` answers `{"ok":true}` and the cron shows in Vercel;
   - try "Your data" and "Report a problem" in a browser (not checked yet);
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
