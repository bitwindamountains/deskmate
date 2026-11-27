# Data rights, problem reports, keep-alive

**Goal:** close three gaps from the 2026-10-24 completeness review: students can export and delete their data (brief E4, line 871), cards and essay feedback have "Report a problem" (brief lines 442 and 853), and the free Supabase project no longer pauses after a quiet week (spec §11).

## Global constraints
- Shared Supabase project: touch only `scholar` and `scholar_private`. **Delete removes the student's Scholar data, not the `auth.users` row**: the sign-in is shared with other apps on this project, and `docs/deploy.md` keeps `SUPABASE_SECRET_KEY` out of the app.
- `quota_usage` and `llm_calls` survive a delete. They hold no content, and deleting them would reset the day's limits.
- Export runs in the browser through RLS, so it has no function response size limit and needs no new route.
- The migration is hand-written and not applied until the owner reviews it.

## Tasks
1. **Migration and DB tests.** `scholar.problem_reports` (insert only for a card or feedback item the student owns), `scholar_private.delete_my_data()` with its `scholar` wrapper, and `scholar.ping()` for the keep-alive; `exportMyData` (`src/lib/account/export.ts`) and `reportProblem` (`src/lib/report/report-problem.ts`), which the DB test exercises. Commit: `feat(db): problem reports, delete my data, keep-alive ping`.
2. **Export and delete on Profile.** The download turns `exportMyData` into one JSON file; `deleteMyData` checks the typed confirmation, calls the RPC, and signs out; the device cache is cleared first. Commit: `feat: download or delete your data from Profile`.
3. **Report a problem.** One component, used in the review session (after the answer shows) and on each feedback card. Commit: `feat: report a problem on cards and feedback`.
4. **Keep-alive.** `GET /api/keep-alive` calls `ping`; `vercel.json` runs it daily (Hobby allows one cron a day). Commit: `feat: daily keep-alive so the free database doesn't pause`.

## Out of scope
- Snapshotting a reported card's text: a report on a card the student later deletes points at nothing. Add a snapshot when reports are first reviewed in earnest.
- An admin screen for reports: the owner reads them with SQL.
