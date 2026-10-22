# Deploying Scholar

Target: Vercel Hobby (free), with the existing shared Supabase project. The owner connects the account and deploys. Nothing here has been run yet.

## Before the first deploy

1. **Check the Hobby terms.** Vercel Hobby is for personal, non-commercial use. A free beta fits; anything that charges students or schools needs Vercel Pro or another host.
2. **Import the repo.** In Vercel, choose "Add New → Project", pick `bitwindamountains/scholar`, framework Next.js. Keep the default build (`next build`) and output settings. Node version: 22 or later (`package.json` engines says `>=22.9`).
3. **Set the environment variables** (Production, and Preview if you use preview deploys):

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from `.env.local` | public |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from `.env.local` | public |
   | `NEXT_PUBLIC_SUPABASE_SCHEMA` | `scholar` | public |
   | `SITE_URL` | `https://<your-domain>` | no trailing slash; Google sign-in fails closed without it in production |
   | `GROQ_API_KEY` | from `.env.local` | server only |
   | `OPENROUTER_API_KEY` | from `.env.local` | server only, fallback provider |
   | `GEMINI_API_KEY` | from `.env.local` | server only, fallback provider |

   Do **not** add `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF` or `SUPABASE_DB_PASSWORD`: the app never reads them; only tests and migrations do.

4. **Supabase Auth URLs** (Dashboard → Authentication → URL Configuration). The project is shared with other apps:
   - Add `https://<your-domain>/auth/callback` to **Redirect URLs**. Add `https://*-<team>.vercel.app/auth/callback` too if you want sign-in on preview deploys.
   - Do **not** change **Site URL**: the other apps on this project rely on it. Scholar always passes its own `redirectTo`.
5. **Google sign-in.** In the Google Cloud OAuth client, the authorized redirect URI is Supabase's (`https://<project-ref>.supabase.co/auth/v1/callback`), which doesn't change. Nothing to add for the new domain unless the consent screen lists authorized domains; then add it there.
6. **Email codes.** Supabase's built-in email sender is for testing and allows only a few emails an hour across the whole project. Before real students sign in with email, set a custom SMTP sender (Dashboard → Authentication → Emails → SMTP). A free-tier transactional email service is enough for a beta.
7. **Function time limit.** Essay analysis makes several LLM calls and can take tens of seconds. In Vercel → Settings → Functions, check the max duration is at least 60 seconds.

## After the first deploy

- Sign in with Google and with an email code; open Today, Study, Write and Progress.
- Run one essay check and one card review to confirm the LLM keys work.
- Check that the PWA installs and that the time zone counts match your local day.
- Run the Supabase advisors (security and performance) once more.

## Known free-tier limits

- Groq free tier: per-minute and per-day token limits; the app's own limit is 60 helper calls a day per student, plus the daily essay checks.
- LanguageTool public API: rate-limited per IP. Vercel functions share IPs, so heavy use may hit it; the sentence-level check then fails and the student is asked to try again (no LLM call is spent).
- Supabase free tier: the project pauses after a week with no activity.
