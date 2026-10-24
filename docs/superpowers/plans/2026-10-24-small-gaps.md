# Small gaps from the completeness review

**Goal:** close the small gaps left in `PROGRESS.md` after PR #23, or rule on them.

## Tasks
1. **Quota messages.** Daily limits stay on the UTC day. The messages now say how long is left ("They reset in about 7 hours") instead of "at midnight UTC". Helper: `src/lib/time/reset.ts`. Commit: `fix: limit messages say how long until they reset`.
2. **Word files in Recall.** The import form accepts `.docx` and puts its text in the paste box, reusing Draft Coach's `extractEssayFile`. Commit: `feat: import a Word file into Recall`.
3. **Report snapshots.** `problem_reports.snapshot` keeps the reported text (card front/back, or feedback summary/quote), read on the server through RLS, so a report still means something after the card is edited or deleted. Commit: `feat: reports keep a copy of the reported text`.
4. **Rulings and PROGRESS.md.** Commit: `docs: rulings and PROGRESS.md for the small gaps`.

## Rulings
- **Daily limits stay on the UTC day.** A per-student local day would come from a time zone the browser sends. Changing that zone moves the day boundary, so a student could get up to three days' limits in one real day. One fixed boundary can't be gamed, and the messages now give the time left, which is correct in every zone.
- **Failed AI calls are not queued (spec §6.1).** When every provider fails, the student's material or draft is already saved and the message says to try again in a few minutes. Nothing is lost and no quota is charged twice (generation and essay checks are idempotent per source or draft). A queue would need a worker. Vercel Hobby runs only one cron a day, which is far too slow to be useful, and the free tiers recover within minutes. Revisit if router logs show long outages.
- **A magic link opened in another browser** has no time zone cookie on the first page. The `(app)` layout's single refresh sets it. The server can't know the zone before the browser runs, so that one refresh is the fix.
- **`GOAL_MATCH = 0.5`** stays until real course material exists to tune it on (waiting on beta students).
