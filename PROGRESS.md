# Progress

Handoff for the next session. Update it at the end of each session. Last updated 2026-10-24.

## State
- `main` has everything through PR #21. PR #18 removed feedback translation and the first-language question (English only). PR #19 writes the time zone cookie on every page, so the first day-based page no longer renders in UTC and then refreshes. PR #21 lets a stopped timer be resumed. On `main`: 466/466 unit tests and the production build pass.
- **Open PR #20 `drop-translation-schema`**: the migration `20261023100000_scholar_drop_translation.sql` drops `scholar.item_translations` and `profiles.first_language`. It is **not applied**: the owner reviews it, applies it, then runs the advisors.
- **Branch `data-rights-reports-keepalive`** (not pushed yet), from the 2026-10-24 completeness review. Plan: `docs/superpowers/plans/2026-10-24-data-rights-reports-keepalive.md`.
  - Profile → "Your data": download everything as JSON (built in the browser through RLS), and delete my data (typed confirmation, clears the device, signs out).
  - Delete removes the student's **Scholar** data only. The `auth.users` row stays because the sign-in is shared with the other apps on this project. `quota_usage` and `llm_calls` stay too, so a delete can't reset the day's limits.
  - "Report a problem" in the review session and on each feedback card, stored in `scholar.problem_reports`.
  - `vercel.json` cron calls `/api/keep-alive` daily (`scholar.ping()`), so the free project doesn't pause.
  - Migration `20261024120000_scholar_reports_delete_ping.sql` is **not applied**. The owner reviews it, applies it, runs the advisors, then runs `npm run test:db` (new: `tests/db/account.test.ts`). Until then the three features fail at runtime.
  - On the branch: 480/480 unit tests, typecheck and the production build pass.
- `graphify-out/` (local, gitignored) was rebuilt on 2026-10-23, and git hooks now rebuild it after each commit (code only).
- All migrations through `20261022170000_scholar_goals_prereqs.sql` are applied and the advisors were checked.

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

## Owner decisions (October 2026)
- Students only: no teacher, class or school features.
- Free-tier AI only: no paid models, and no heavy AI features that need them (Phase 2d).
- Hosting is prep only: `docs/deploy.md` is the Vercel Hobby checklist, and the owner deploys.
- English only: no translation and no other essay or card languages.
- Deleting data never deletes the shared `auth.users` row (2026-10-24).
- The owner merges PRs. After a merge, delete the branch locally and on GitHub.

## Next steps
1. **The owner reviews, applies and merges PR #20** (drop the translation schema), then runs the advisors.
2. **Apply `20261024120000_scholar_reports_delete_ping.sql`, run the advisors and `npm run test:db`, then push the branch and open a PR.**
3. **Small gaps:**
   - a magic link opened in a different browser than the one used to sign in still lands on `/today` without the time zone cookie, so the `(app)` layout's one refresh covers it;
   - the goal-match threshold `GOAL_MATCH = 0.5` in `src/review/goals.ts` hasn't been tuned on real courses.
4. **Waiting on the owner:**
   - import a real deck exported from current Anki (WAL mode and multi-frame zstd are unverified);
   - deploy per `docs/deploy.md`, including custom SMTP for sign-in emails;
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
