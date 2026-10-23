# Progress

Handoff for the next session. Update it at the end of each session. Last updated 2026-10-23.

## State
- `main` has everything through PR #17 (Phase 3b). On merged `main`: 471/471 unit tests and the production build pass.
- **Open PR #18 `english-only`**: removes the "Explain in Filipino/Spanish" feedback translation and the first-language question in onboarding. With it: 464/464 tests and the build pass. It waits for the owner to merge.
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
- The owner merges PRs. After a merge, delete the branch locally and on GitHub.

## Next steps
1. **The owner merges PR #18.** Optional follow-up: a migration that drops the unused `scholar.item_translations` table and the `profiles.first_language` column (the owner reviews it first).
2. **First-visit time zone.** A student's first page renders with UTC "today" until `TimeZoneCookie` sets the cookie and refreshes. Investigation started in `src/components/time-zone-cookie.tsx` and `src/lib/time/user-zone.ts`; nothing has changed yet.
3. **Small gaps:**
   - stopping a timer can't be undone;
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
