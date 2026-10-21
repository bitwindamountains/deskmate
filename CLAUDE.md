# Scholar

AI study app: Draft Coach (essay feedback) and Recall (cards + FSRS review). The AI coaches; the student does the work.
Next.js 16 / React 19, Supabase, Tailwind 4, vitest. Node >= 22.9.

## Where things are
- Brief: `ai-learning-platform-brief.md`. Spec: `docs/superpowers/specs/2026-10-20-scholar-design.md`.
- Plans, one per phase: `docs/superpowers/plans/`. Work task by task, tests first, one commit per task (the message is given in the plan). Each plan's Global Constraints and Review Focus apply.
- UI follows `DESIGN.md` (tokens in `src/app/globals.css`). Product context is in `PRODUCT.md` (Impeccable).
- `graphify-out/` is a code map, and it can be stale.

## Commands
- `npm test`: unit and component tests (jsdom).
- `npm run test:db`: tests in `tests/db/` against the real Supabase project (reads `.env.local`, runs serially).
- `npm run eval`: LLM router eval. `npm run build`: production build.

## Hard rules
- Free, open-source, or free-tier services only. Pin exact versions (`npm i -E`).
- **Shared Supabase project.** Touch only the schemas `scholar` and `scholar_private`. Never touch `public`, `auth`, `rentflow`, `invoicetracker`.
- Migrations are hand-written in `supabase/migrations/`. The owner sees each one before it is applied. Run the Supabase advisors after applying.
- Every table: RLS on; `revoke all ... from public, anon, authenticated`; explicit grants; `grant all ... to service_role`. Policies use `to authenticated` with `(select auth.uid()) = user_id`.
- Privileged writes go through `scholar_private.*` functions: `security definer`, `set search_path = ''`, fully qualified names, an explicit ownership check, every input validated. Each has a `scholar.*` `security invoker` wrapper.
- Server auth uses `supabase.auth.getClaims()`, never `getSession()`. Never authorize from `user_metadata`.
- `SUPABASE_SECRET_KEY` is used only in server code and tests, never in a `NEXT_PUBLIC_` variable.
- Production LLM calls keep `requireNoTraining: true` (the router default). LLM calls are scarce: deterministic code, the device, and caches come first.
- Beta is 18+ only. Accessibility is WCAG 2.2 AA: keyboard works everywhere, color is never the only signal. Mobile first.
- No guilt-based copy and no streak pressure.
- Line endings are LF.
