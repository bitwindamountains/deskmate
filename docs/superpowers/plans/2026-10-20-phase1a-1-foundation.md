# Phase 1a-1: App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in adult user can open the Scholar PWA, finish a short onboarding, and land on an app shell with a Today screen, backed by a Supabase free-plan database with row-level security.

**Architecture:** The existing Phase 0 package becomes a Next.js 16 App Router app (`src/app`), keeping `src/llm`, `src/grounding.ts`, and `src/rank.ts` where they are. Supabase provides Postgres, Auth, and RLS; the app talks to it with `@supabase/ssr` (browser client, server client, and session refresh in `src/proxy.ts`). There is no local Supabase (no Docker on the dev machine): a hosted free project `scholar-dev` is the dev database, and RLS is tested with vitest against it.

**Tech Stack:** Next.js 16.4, React, Tailwind CSS v4, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.118, Supabase CLI 2.121 (via `npx supabase`), zod, vitest, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md` (§3, §4, §5, §7 Phase 1a, §9). Product truth: `PRODUCT.md`. Brief screens: `ai-learning-platform-brief.md` C3, C4, B-S1.

**Sequence:** this plan is first of three. 1a-2 (import + generation) and 1a-3 (review) build on its tables, clients, and shell.

## Global Constraints

- Free, open-source, or free-tier services only.
- Beta is 18+ only: no account reaches the app without an 18+ attestation (spec §5 item 1).
- Onboarding states in one plain sentence which AI providers process the student's text (spec §5 item 3).
- Production LLM calls use `requireNoTraining: true` (spec §5 item 2); after Task 1 this is the router default.
- Every table in `public` has RLS enabled and explicit `GRANT`s to `authenticated` only; never grant to `anon`. New tables are no longer auto-exposed to the Data API (Supabase breaking change, 2026-04-28; enforced on all projects 2026-10-30).
- RLS policies use `to authenticated` plus an ownership predicate `(select auth.uid()) = user_id`; every UPDATE policy has both `using` and `with check`.
- Authorization never reads `user_metadata`.
- The secret key (`SUPABASE_SECRET_KEY`) is used only in tests and server code; never in a `NEXT_PUBLIC_` variable.
- Session checks on the server use `supabase.auth.getClaims()`, not `getSession()`.
- Pin exact package versions (`npm i -E`) and commit `package-lock.json`.
- Built-in Supabase email allows 2 emails/hour: sign-in is Google OAuth, plus email OTP sent through a free custom SMTP provider (owner's choice, e.g. Resend or Brevo free tier).
- Accessibility: WCAG 2.2 AA; keyboard reachable; color never the only signal; dyslexia-friendly font option (OpenDyslexic) and Atkinson Hyperlegible as the default text font (both OFL).
- Mobile-first: bottom tabs below 768px, sidebar at 768px and up (brief C3).
- UI tasks follow `DESIGN.md`, created in Task 6 Step 1 via `/impeccable`.

## Review Focus

1. **A user tampers with the request to read or update another user's profile.** Expect zero rows and no error leak. Tested in Task 2.
2. **A signed-in user who never finished onboarding opens `/today` directly.** Expect a redirect to `/onboarding`, not a broken Today screen. Tested in Task 5.
3. **Onboarding submitted without the 18+ box, or with a forged `adult_attested=true` but an empty language field.** Expect a field error and nothing saved. Tested in Task 5.
4. **An expired or missing session on a protected route.** Expect a redirect to `/login?next=<path>`, and a return to that path after sign-in. Tested in Task 4.
5. **The OAuth callback receives `next=https://evil.example`.** Expect the redirect to be refused and replaced with `/today`. Tested in Task 4.

## Prerequisites (owner, once)

- Create a free Supabase project `scholar-dev`. Enable Google provider (Auth → Providers) and custom SMTP (Auth → SMTP). Add `http://localhost:3000/auth/callback` to the redirect allow-list.
- Create `.env.local` from `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, and at least `GROQ_API_KEY`.
- Run `npx supabase login` (use a scoped personal access token), then `npx supabase link --project-ref $SUPABASE_PROJECT_REF`.

---

### Task 1: Next.js app inside the existing package; router privacy default

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- Create: `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/manifest.ts`
- Modify: `src/llm/router.ts` (default `requireNoTraining`)
- Test: `tests/llm/router.test.ts`, `tests/app/manifest.test.ts`

**Interfaces:**
- Produces: `CompleteOptions.requireNoTraining` now defaults to `true`; callers that want training-allowed providers pass `false`. `eval/runEval.ts` passes `requireNoTraining: false` (synthetic samples only).
- Produces: `src/app/manifest.ts` default export returning a `MetadataRoute.Manifest` with `name: 'Scholar'`, `short_name: 'Scholar'`, `start_url: '/today'`, `display: 'standalone'`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/llm/router.test.ts (add)
test('requireNoTraining defaults to true', async () => {
  stubHosts({ b: [{ content: '{"n":1}' }] });
  const r = await complete('grade_answer', pr, s, { env, providers: [{ ...a, trainsOnInputs: true }, b] });
  expect(statuses(r.log)).toEqual(['skipped_privacy', 'ok']);
});
// tests/app/manifest.test.ts
test('manifest starts at /today in standalone mode', () => {
  expect(manifest()).toMatchObject({ name: 'Scholar', start_url: '/today', display: 'standalone' });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/llm/router.test.ts tests/app` → the new router test fails (log `['ok']`); manifest module not found.

- [ ] **Step 3: Implement.** Install pinned: `next@16.4.2 react react-dom` and dev `@tailwindcss/postcss tailwindcss @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @types/react @types/react-dom`. Scripts: `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"test": "vitest run"`, `"test:db": "vitest run --config vitest.db.config.ts"` (the config file arrives in Task 2). `vitest.config.ts`: React plugin, `environment: 'jsdom'` for `tests/app/**`, `node` otherwise, `exclude: ['tests/db/**', 'node_modules/**']`. `tsconfig.json`: add `"jsx": "preserve"`, `"lib": ["dom", "dom.iterable", "ES2022"]`, the Next plugin, and paths `"@/*": ["./src/*"]`. Flip the router default; update the existing tests that relied on `false` by passing `requireNoTraining: false` explicitly. Layout loads Atkinson Hyperlegible from Google Fonts via `next/font/google`.

- [ ] **Step 4: Run, expect PASS** — `npm test` → all pass. Then `npm run build` → completes without type errors.

- [ ] **Step 5: Commit** — `git commit -m "feat: Next.js app shell in existing package; router blocks training providers by default"`

---

### Task 2: Profiles table, RLS, and the DB test harness

**Files:**
- Create: `supabase/migrations/<timestamp>_profiles.sql` (via `npx supabase migration new profiles`)
- Create: `vitest.db.config.ts`, `tests/db/helpers.ts`, `tests/db/profiles.test.ts`

**Interfaces:**
- Produces table `public.profiles`:

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` PK | `references auth.users(id) on delete cascade` |
| `display_name` | `text` | nullable |
| `adult_attested_at` | `timestamptz` | null until onboarding |
| `first_language` | `text` | nullable, BCP 47 tag, e.g. `fil`, `es` |
| `study_minutes_per_day` | `smallint` | `check (between 5 and 120)`, default 20 |
| `preferences` | `jsonb` | default `'{}'`; keys `font: 'default'|'dyslexic'`, `reduced_motion: boolean` |
| `onboarded_at` | `timestamptz` | null until onboarding |
| `created_at` | `timestamptz` | default `now()` |

- A trigger `on auth.users insert` creates the profile row. The function lives in schema `private`, is `security definer`, and sets `search_path = ''`. It is not in `public`, so it is not callable over the API.
- Policies: select, update (with `using` and `with check`) for `to authenticated` with `(select auth.uid()) = user_id`. No insert or delete policy, because the trigger and the FK cascade own both.
- `grant select, update on public.profiles to authenticated;`
- `tests/db/helpers.ts` produces:
```ts
export function adminClient(): SupabaseClient;                       // secret key, server-only
export async function createTestUser(): Promise<{ client: SupabaseClient; userId: string; email: string }>; // admin.createUser({email_confirm:true, password}), then signInWithPassword on a publishable-key client
export async function deleteTestUser(userId: string): Promise<void>;
```
`vitest.db.config.ts` loads `.env.local`, includes only `tests/db/**`, `environment: 'node'`, `fileParallelism: false`.

- [ ] **Step 1: Write the failing tests** (`tests/db/profiles.test.ts`; `beforeAll` creates users A and B, `afterAll` deletes them)

```ts
test('signup creates an empty profile', async () => {
  const { data } = await A.client.from('profiles').select('*').single();
  expect(data).toMatchObject({ user_id: A.userId, onboarded_at: null, adult_attested_at: null, study_minutes_per_day: 20 });
});
test('a user cannot read another user profile', async () => {
  const { data, error } = await A.client.from('profiles').select('*').eq('user_id', B.userId);
  expect(error).toBeNull(); expect(data).toEqual([]);
});
test('a user cannot update another user profile', async () => {
  const { data } = await A.client.from('profiles').update({ display_name: 'x' }).eq('user_id', B.userId).select();
  expect(data).toEqual([]);
});
test('a user cannot move their row to another user_id', async () => {
  const { error } = await A.client.from('profiles').update({ user_id: B.userId }).eq('user_id', A.userId);
  expect(error).not.toBeNull();
});
test('study_minutes_per_day outside 5..120 is rejected', ...);
test('anon cannot read profiles', async () => {
  const { data } = await anonClient().from('profiles').select('*');
  expect(data ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npm run test:db` → fails: relation `public.profiles` does not exist.

- [ ] **Step 3: Write the migration** (`npx supabase migration new profiles`), then apply it: `npx supabase db push`. Run the advisors (`npx supabase db advisors --help` first to find the linked-project flag) and fix every security warning.

- [ ] **Step 4: Run, expect PASS** — `npm run test:db` → 6 passed. Advisors report no security issues.

- [ ] **Step 5: Commit** — `git commit -m "feat: profiles table with RLS and DB test harness"`

---

### Task 3: Supabase clients and session refresh

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`
- Create: `src/lib/auth/paths.ts`
- Test: `tests/lib/paths.test.ts`

**Interfaces:**
- Produces:
```ts
// client.ts
export function createClient(): SupabaseClient;              // createBrowserClient(URL, PUBLISHABLE_KEY)
// server.ts
export async function createClient(): Promise<SupabaseClient>; // createServerClient with next/headers cookies()
// proxy.ts (lib)
export async function updateSession(request: NextRequest): Promise<NextResponse>;
// paths.ts
export const PUBLIC_PATHS: readonly string[];               // ['/', '/login', '/auth/callback', '/manifest.webmanifest']
export function isPublicPath(pathname: string): boolean;     // exact match, or startsWith('/_next/')
export function safeNext(next: string | null | undefined): string; // same-origin relative path or '/today'
```
- `src/proxy.ts` exports `proxy(request)` that calls `updateSession`. Its `config.matcher` excludes static assets. Inside `updateSession`, an unauthenticated request (per `getClaims()`) for a non-public path redirects to `/login?next=<pathname+search>`. Follow the current Supabase Next.js SSR guide (`https://supabase.com/docs/guides/auth/server-side/nextjs.md`) for the cookie `getAll`/`setAll` wiring; do not hand-roll it.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([['/today', '/today'], ['/study/deck/1?x=2', '/study/deck/1?x=2'], ['https://evil.example', '/today'],
  ['//evil.example', '/today'], ['/\\evil.example', '/today'], [null, '/today'], ['today', '/today']])
  ('safeNext(%s) = %s', (i, o) => expect(safeNext(i)).toBe(o));
test('isPublicPath', () => {
  expect(isPublicPath('/login')).toBe(true);
  expect(isPublicPath('/_next/static/a.js')).toBe(true);
  expect(isPublicPath('/today')).toBe(false);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/lib` → module not found.

- [ ] **Step 3: Implement.** `safeNext` accepts only strings starting with a single `/` that is not followed by `/` or `\`.

- [ ] **Step 4: Run, expect PASS** — `npx vitest run tests/lib` → passed. `npm run build` → succeeds.

- [ ] **Step 5: Commit** — `git commit -m "feat: Supabase SSR clients and session-refreshing proxy"`

---

### Task 4: Sign-in (Google + email OTP) and callback

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`
- Test: `tests/app/login.test.tsx`, `tests/app/callback.test.ts`

**Interfaces:**
- Consumes: `createClient` (server), `safeNext` (Task 3).
- Produces:
```ts
// actions.ts ('use server')
export async function signInWithGoogle(formData: FormData): Promise<void>;   // signInWithOAuth({provider:'google', options:{redirectTo: `${origin}/auth/callback?next=${safeNext(next)}`}}) then redirect(url)
export async function sendEmailCode(prev: LoginState, formData: FormData): Promise<LoginState>;
export async function verifyEmailCode(prev: LoginState, formData: FormData): Promise<LoginState>; // on success redirect(safeNext(next))
export type LoginState = { step: 'email' | 'code'; email?: string; error?: string };
// callback/route.ts
export async function GET(request: NextRequest): Promise<NextResponse>; // exchangeCodeForSession(code); redirect to safeNext(next); on error redirect('/login?error=callback')
```
- Login copy: heading "Sign in to Scholar". Buttons "Continue with Google" and "Email me a code". The code field label is "6-digit code". Errors: "That code didn't work. Check it, or send a new one." and "Too many attempts. Wait a minute, then try again." (the latter maps the 429 / `over_email_send_rate_limit` error).
- The page renders each error with `role="alert"`. Every input has a visible `<label>`.

- [ ] **Step 1: Write the failing tests**

```ts
// callback.test.ts — mock '@/lib/supabase/server' so exchangeCodeForSession resolves {error:null}
test('callback redirects to a safe next path', async () => {
  const res = await GET(new NextRequest('http://localhost:3000/auth/callback?code=c&next=/study'));
  expect(res.headers.get('location')).toBe('http://localhost:3000/study');
});
test('callback refuses an external next', ...);       // next=https://evil.example → location ends with /today
test('callback with exchange error goes to /login?error=callback', ...);
// login.test.tsx
test('renders Google button and email field with a label', ...);
test('shows the rate-limit message when sendEmailCode returns it', ...);
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/app` → modules not found.

- [ ] **Step 3: Implement** the page, actions, callback, and sign-out (a POST route that calls `signOut()` and redirects to `/login`).

- [ ] **Step 4: Run, expect PASS** — `npx vitest run tests/app` → passed. Manual check with `npm run dev`: visiting `/today` while signed out lands on `/login?next=%2Ftoday`; Google sign-in returns to `/today` (Task 5 then redirects to onboarding).

- [ ] **Step 5: Commit** — `git commit -m "feat: Google and email-code sign-in with safe redirects"`

---

### Task 5: Onboarding with the 18+ gate

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/app/onboarding/actions.ts`, `src/lib/profile/onboarding.ts`, `src/lib/profile/require.ts`
- Test: `tests/lib/onboarding.test.ts`, `tests/db/onboarding.test.ts`

**Interfaces:**
- Produces:
```ts
// onboarding.ts
export const OnboardingInput: z.ZodType<{ adult: true; first_language: string; study_minutes_per_day: number; font: 'default' | 'dyslexic'; reduced_motion: boolean }>;
export function parseOnboarding(fd: FormData): { ok: true; value: z.infer<typeof OnboardingInput> } | { ok: false; errors: Record<string, string> };
// actions.ts
export async function completeOnboarding(prev: OnboardingState, fd: FormData): Promise<OnboardingState>; // update own profile: adult_attested_at=now(), onboarded_at=now(), first_language, study_minutes_per_day, preferences; then redirect('/today')
// require.ts
export type Profile = { user_id: string; display_name: string | null; adult_attested_at: string | null; first_language: string | null;
  study_minutes_per_day: number; preferences: { font?: 'default' | 'dyslexic'; reduced_motion?: boolean }; onboarded_at: string | null };
export async function requireOnboardedUser(): Promise<{ userId: string; profile: Profile }>; // no claims → redirect('/login'); onboarded_at null → redirect('/onboarding')
```
- Fields and copy (brief C4, trimmed to what Phase 1a uses):
  1. Checkbox "I am 18 or older." Required; error "Scholar's beta is for adults (18+) for now."
  2. "Your first language", a select with a short list (English, Filipino, Spanish, Other) plus a free-text "Other" box. Required.
  3. "How many minutes a day can you study?", a number input from 5 to 120, default 20.
  4. "Reading font", radio: "Standard" / "Dyslexia-friendly".
  5. Checkbox "Reduce motion".
- The disclosure paragraph shows above the submit button, verbatim: "Scholar uses AI to make flashcards and check your answers. Your study material is sent to Groq to do this. Groq's terms say it does not train its models on what you send." (`ponytail:` this sentence is tied to the `trainsOnInputs: false` providers in `src/llm/config.ts`; update both together.)
- Submit button: "Start studying".

- [ ] **Step 1: Write the failing tests**

```ts
test('missing 18+ box gives the adult error and no value', () => {
  const r = parseOnboarding(fd({ first_language: 'fil', study_minutes_per_day: '20', font: 'default' }));
  expect(r).toEqual({ ok: false, errors: { adult: "Scholar's beta is for adults (18+) for now." } });
});
test('empty language is a field error', ...);
test('"Other" uses the free-text value', ...);          // first_language=other, first_language_other='Ilocano' → 'Ilocano'
test('study minutes 3 or 200 are rejected', ...);
test('valid input parses with defaults', ...);
// tests/db/onboarding.test.ts
test('completing onboarding sets both timestamps for own row only', ...);
```
Plus a component test in `tests/app/onboarding.test.tsx`: `requireOnboardedUser` with a profile whose `onboarded_at` is null calls `redirect('/onboarding')` (mock `next/navigation`).

- [ ] **Step 2: Run, expect FAIL** — `npm test` → modules not found.

- [ ] **Step 3: Implement.** The `(app)` route group layout (Task 6) calls `requireOnboardedUser()`. `/onboarding` redirects to `/today` when already onboarded.

- [ ] **Step 4: Run, expect PASS** — `npm test` and `npm run test:db` → all passed.

- [ ] **Step 5: Commit** — `git commit -m "feat: onboarding with 18+ attestation and AI disclosure"`

---

### Task 6: Visual direction, app shell, and Today empty state

**Files:**
- Create: `DESIGN.md` (from `/impeccable`), `src/app/(app)/layout.tsx`, `src/app/(app)/today/page.tsx`, `src/app/(app)/study/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/components/nav.tsx`
- Modify: `src/app/globals.css` (design tokens, light + dark, dyslexic font class)
- Test: `tests/app/nav.test.tsx`, `tests/app/today.test.tsx`

**Interfaces:**
- Consumes: `requireOnboardedUser` (Task 5).
- Produces: `<Nav current="today" | "study" | "profile" />` with three items in this order: Today (`/today`), Study (`/study`), Profile (`/profile`). The link to the current page has `aria-current="page"`. Draft Coach's "Write" tab is not shown until Phase 1b.
- Produces: the `(app)` layout applies `data-font="dyslexic"` and `data-reduced-motion` on `<body>` from the profile preferences.
- Today empty state (brief A5.5/B5.5): heading "Nothing to study yet", body "Turn your notes into a few good flashcards.", and a primary link "Import material" to `/study/import` (built in plan 1a-2). Study page: "Your decks" list placeholder, with the same empty state. Profile page: shows the current preferences, a "Sign out" button, and a link back to `/onboarding?edit=1` to change them.

- [ ] **Step 1: Set the visual direction.** Run `/impeccable` for the app shell (Operate mode). It writes `DESIGN.md` and the tokens. The brief's layer colors (A5.4) are suggestions; the shell must work in light and dark mode (brief §0 UI designer prompt, principle 7).

- [ ] **Step 2: Write the failing tests**

```ts
test('nav marks the current page and lists Today, Study, Profile in order', ...);
test('Today shows the empty state with an Import material link to /study/import', ...);
test('dyslexic preference sets data-font on body', ...);
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run tests/app` → modules not found.

- [ ] **Step 4: Implement** the layout, nav (bottom tabs below 768px, sidebar from 768px), and the three pages.

- [ ] **Step 5: Run, expect PASS** — `npm test` → all passed; `npm run build` → succeeds. Then run the Impeccable detector once over `src/app` and `src/components` (`impeccable detect --json`) and fix what it reports.

- [ ] **Step 6: Commit** — `git commit -m "feat: app shell, navigation, and Today empty state"`
