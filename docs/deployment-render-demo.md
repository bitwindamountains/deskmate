# Public demo on Render (free)

A "Try the demo" site for the portfolio. It is not for real students. `render.demo.yaml` describes one free Render web service (`deskmate-demo`, Singapore) running the app with `DEMO_MODE=true`.

## What demo mode does

- `/login` shows **Try the demo** instead of the sign-in form. It posts to `/api/demo`, which creates a throwaway account and signs the visitor in. The account's email is `demo-<uuid>@scholar-demo.invalid` (unchanged by the rename: `DEMO_DOMAIN` in `src/lib/demo/accounts.ts`; cleanup matches it) and it carries `app_metadata.scholar_demo`. The account is seeded by `src/lib/demo/seed.ts` with the content in `src/lib/demo/content.ts`:
  - two decks of cards made from class notes, with a week of review history;
  - 4 cards waiting to be sorted;
  - an essay with finished feedback.
- Every page shows a "Demo account" banner with **Start over**, which makes a fresh account.
- **AI is off.** `complete()` in `src/llm/router.ts` throws in demo mode before any provider is called, so AI features answer "busy" and no provider quota is spent. Seeded feedback, hints levels 1–2, review, triage, warm-up, practice tests and Progress all work without AI.
- **Cleanup.** Each new demo first deletes demo accounts older than a day, and the oldest ones beyond 25. Deleting the auth user cascades to every `scholar` row. Cleanup only ever deletes users that have both the demo email domain and the flag (`isDemoUser`; `tests/lib/demo-accounts.test.ts` checks it).
- **Start limit.** A visitor can start 5 demos an hour. The count is kept in memory per instance and keyed on the last `X-Forwarded-For` entry, which Render's proxy appends.

**Shared project (owner decision, 2026-11-27).** The demo uses the same Supabase project as production and the other apps, so demo visitors are rows in the shared `auth.users` for up to a day. Its secret key lives in Render's environment.

## Deploy

1. Push `main` to GitHub. In Render, choose **New → Blueprint**, pick the repo and set the blueprint path to `render.demo.yaml`. If Render asks for a card and declines it, create the service by hand instead: **New → Web Service** from this repo, with the name, region, Free plan, build command, start command, health check path and variables from the file.
2. Fill the three `sync: false` variables from `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The first two are read at build time, so set them before the first build, or redeploy after setting them. Don't add any LLM key.
3. If Render names the service something other than `deskmate-demo.onrender.com`, set `SITE_URL` to the real `https://…onrender.com` origin (no trailing slash) and redeploy. A wrong `SITE_URL` makes **Try the demo** come back with "The demo couldn't start".
4. Nothing to add in Supabase: the demo signs in with a password on the server, so no redirect URL is involved.

## Check after deploying

The service sleeps after about 15 minutes idle, so the first visit can take about a minute.

- `https://<service>.onrender.com/api/keep-alive` answers `{"ok":true}`.
- On `/login`, **Try the demo** opens Today with the banner: 11 cards to review, and the essay with 3 of 3 priorities open.
- On Study there are two decks, plus "Sort 4 new cards" on Cell Biology. Open the essay and choose Show next hint.
- **Start over** in the banner gives a fresh account.
- The Render logs show no `demo_start_failed`.

## Limits

- **Supabase pausing.** The free project pauses after 7 days without requests, and a sleeping demo sends none. `.github/workflows/keep-alive.yml` calls `/api/keep-alive` on the demo once a day, which wakes Render and pings Supabase. If it ever fails, it shows in the repo's Actions tab.

- **Build memory.** The free plan has 512 MB, and `next build` can run out. If the build is killed, retry. If it keeps failing, add `NODE_OPTIONS=--max-old-space-size=460`.
- **Cold start.** After idle, the first page and the first **Try the demo** are slow (the page says so).
- **Real sign-in is hidden but not removed.** The sign-in server actions still exist, so a real account could sign in on the demo URL by calling them directly. It would see its own data, exactly as on the real site.

## Run the demo locally

```sh
DEMO_MODE=true SITE_URL=http://localhost:3100 GROQ_API_KEY= MISTRAL_API_KEY= GEMINI_API_KEY= npx next dev -p 3100
```

This uses `.env.local`, so demo accounts land in the shared project like on Render, and they are cleaned up the same way. `tests/db/demo.test.ts` seeds one account, checks what the app loads from it, and deletes it.
