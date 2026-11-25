# Scholar

AI study app: Draft Coach (essay feedback) and Recall (cards + FSRS review). The AI coaches; the student does the work.
Next.js 16 / React 19, Supabase, Tailwind 4, vitest. Node >= 22.9.

## Where things are
- **Start here:** `PROGRESS.md` has the current state, open PRs, owner decisions and next steps. Update it at the end of each session.
- Brief: `ai-learning-platform-brief.md`. Spec: `docs/superpowers/specs/2026-10-20-scholar-design.md`.
- Plans, one per phase: `docs/superpowers/plans/`. Work task by task, tests first, one commit per task (the message is given in the plan). Each plan's Global Constraints and Review Focus apply.
- UI follows `DESIGN.md` ("The Study Desk": index cards, ballpoint, a lime highlighter; tokens in `src/app/globals.css`). Every visual or motion element must be something a student actually uses to study, not a metaphor (owner, 2026-10-25). Product context is in `PRODUCT.md` (Impeccable).
- `graphify-out/` is a code map (local only, gitignored). Keep it current: a post-commit hook rebuilds code changes on its own; after changing docs, plans, or other non-code files, run `/graphify --update` before ending the session.

## Scope (owner decisions)
- Students only: no teacher, class or school features.
- English only: no translation and no other essay or card languages. The brief's first-language explanations (A3.9) are out.
- The owner deploys (`docs/deploy.md`). Claude may merge its own PRs after typecheck, `npm test`, `npm run test:db` and the build pass, then deletes the branch locally and on GitHub (owner grant, brief Part K #14).

## Commands
- `npx tsc --noEmit`: typecheck. There is no lint script.
- `npm test`: unit and component tests (jsdom).
- `npm run test:db`: tests in `tests/db/` against the real Supabase project (reads `.env.local`, runs serially).
- `npm run eval`: LLM router eval. `npm run build`: production build.

## Hard rules
- Free, open-source, or free-tier services only. Pin exact versions (`npm i -E`).
- **Shared Supabase project.** Touch only the schemas `scholar` and `scholar_private`. Never touch `public`, `auth`, `rentflow`, `invoicetracker`.
- Migrations are hand-written in `supabase/migrations/`. Claude may apply them (owner grant, brief Part K #15): run the DB tests and the Supabase advisors after applying, and name each migration in its PR. Anything destructive (dropping a table or column, deleting data) still waits for the owner.
- Every table: RLS on; `revoke all ... from public, anon, authenticated`; explicit grants; `grant all ... to service_role`. Policies use `to authenticated` with `(select auth.uid()) = user_id`.
- Privileged writes go through `scholar_private.*` functions: `security definer`, `set search_path = ''`, fully qualified names, an explicit ownership check, every input validated. Each has a `scholar.*` `security invoker` wrapper.
- Server auth uses `supabase.auth.getClaims()`, never `getSession()`. Never authorize from `user_metadata`.
- Sign-in is email + password (one email confirmation per account, reset by emailed link) or Google (brief Part K #16). The Supabase auth settings are project-wide and shared with other apps: don't change them.
- `SUPABASE_SECRET_KEY` is used only in server code and tests, never in a `NEXT_PUBLIC_` variable.
- Production LLM calls keep `requireNoTraining: true` (the router default). LLM calls are scarce: deterministic code, the device, and caches come first.
- Before changing a prompt, model, or LLM setting, read `docs/superpowers/notes/2026-10-21-token-budget.md`. It lists what was measured, kept, and rejected. Re-run the eval after the change and add a row.
- Beta is 18+ only. Accessibility is WCAG 2.2 AA: keyboard works everywhere, color is never the only signal. Mobile first.
- No guilt-based copy and no streak pressure.
- Page titles come from `AppPage` (`<title>{title} · Scholar</title>`); pages outside it export `metadata.title`. The root layout sets no title, so there is only ever one (WCAG 2.4.2).
- Every LLM route has a daily cap through a `scholar_private.consume_*_quota()` function (essays 5, generations 3, hints and help 60, grades 300); check it after any cache and before the AI call. A new LLM route needs one too.
- Line endings are LF.

## Dependencies
- `next build` stops with `SecurityFatalError` on a Next version with known advisories (the message comes last, after the route list): pin the patched version with `npm i -E`, don't work around it.
- `ts-fsrs` stays on 5.x (FSRS-6). v6 makes FSRS-7 the default, adds `stabilityFast` to card states, changes fuzzing and needs Node 24: a scheduling and data migration that waits for the owner.
- sql.js loads its wasm from `public/vendor/sql-wasm-<version>.wasm` (`SQL_WASM` in `transfer.tsx`). When bumping sql.js, copy the new `node_modules/sql.js/dist/sql-wasm.wasm` there, update the constant, delete the old file; `tests/lib/sql-wasm.test.ts` fails if they drift.
