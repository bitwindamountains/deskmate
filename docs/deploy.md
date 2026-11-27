# Deploying Deskmate

Target: Vercel Hobby (free), with the existing shared Supabase project. The owner connects the account and deploys. Nothing here has been run yet.

## Before the first deploy

1. **Check the Hobby terms.** Vercel Hobby is for personal, non-commercial use. A free beta fits; anything that charges students or schools needs Vercel Pro or another host.
2. **Import the repo.** In Vercel, choose "Add New → Project", pick `bitwindamountains/deskmate`, framework Next.js. Keep the default build (`next build`) and output settings. Node version: 22 or later (`package.json` engines says `>=22.9`).
3. **Set the environment variables** (Production, and Preview if you use preview deploys):

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from `.env.local` | public |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from `.env.local` | public |
   | `NEXT_PUBLIC_SUPABASE_SCHEMA` | `scholar` | public |
   | `SITE_URL` | `https://<your-domain>` | no trailing slash; Google sign-in fails closed without it in production |
   | `GROQ_API_KEY` | from `.env.local` | server only |
   | `MISTRAL_API_KEY` | from Mistral's console | server only; serves students when Groq is busy. **First** turn off "Anonymous improvement data" in Mistral's Admin Console: the router treats Mistral as not training on inputs only on that condition |
   | `GEMINI_API_KEY` | from `.env.local` | server only; optional. Its free tier may train on inputs, so production never uses it (eval and development only) |

   Do **not** add `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF` or `SUPABASE_DB_PASSWORD`: the app never reads them; only tests and migrations do.

4. **Supabase Auth URLs** (Dashboard → Authentication → URL Configuration). The project is shared with other apps:
   - Add `https://<your-domain>/auth/callback` to **Redirect URLs**. Add `https://*-<team>.vercel.app/auth/callback` too if you want sign-in on preview deploys.
   - Do **not** change **Site URL**: the other apps on this project rely on it. Deskmate always passes its own `redirectTo`.
5. **Google sign-in.** In the Google Cloud OAuth client, the authorized redirect URI is Supabase's (`https://<project-ref>.supabase.co/auth/v1/callback`), which doesn't change. Nothing to add for the new domain unless the consent screen lists authorized domains; then add it there.
6. **Email and password.** Students sign in with a password; email is sent only to confirm a new account and for a password reset. Both links come back through `/auth/callback`, so the Redirect URLs entry above covers them. Supabase's built-in email sender is for testing and allows only a few emails an hour across the whole project; before real students sign up, set a custom SMTP sender (Dashboard → Authentication → Emails → SMTP). A free-tier transactional email service is enough for a beta. Leave **Confirm email** on (Authentication → Providers → Email): Deskmate relies on it to prove the address belongs to the student.
7. **Function time limit.** Every route that makes an AI call sets `maxDuration = 60` in its own file (`tests/lib/route-duration.test.ts` checks them), so nothing needs setting in the dashboard. 60 seconds is the Hobby limit without Fluid compute; with Fluid compute (on by default for new projects) Hobby allows more, and 60 is still enough.

## After the first deploy

- Sign in with Google; create an account with email and password, confirm it from the email, and sign in; try "Forgot your password?". Open Today, Study, Write and Progress.
- Run one essay check and one card review to confirm the LLM keys work.
- Check that the PWA installs and that the time zone counts match your local day.
- Run the Supabase advisors (security and performance) once more.
- Open `https://<your-domain>/api/keep-alive`: it should answer `{"ok":true}`.

## Known free-tier limits

- Groq free tier: per-minute and per-day token limits; the app's own limit is 60 helper calls a day per student, plus the daily essay checks. The router keeps each provider under its per-minute limits (`limits` in `src/llm/config.ts`) and skips one that just answered 429 until its Retry-After passes, going to Mistral instead. Those counts live in each server instance's memory, so with several instances the provider's own 429 is still the backstop.
- LanguageTool public API: rate-limited per IP. Vercel functions share IPs, so heavy use may hit it; the sentence-level check then fails and the student is asked to try again (no LLM call is spent).
- Supabase free tier: the project pauses after a week with no activity. `vercel.json` has Vercel call `/api/keep-alive` once a day to prevent that; it needs no setup. Check it under Settings → Cron Jobs after the first deploy.
