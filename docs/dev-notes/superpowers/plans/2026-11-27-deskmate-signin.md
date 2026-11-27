# Deskmate rename and sign-in redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename everything people see from Scholar to Deskmate, and rebuild sign-in around a try-a-card (direction A).

**Architecture:** The rename is string changes plus their tests. Sign-in becomes a two-column page: a new client component `TryCard` on the left (answers checked on the device with review's matching, spacing from the real scheduler), and the existing `LoginForm` or `DemoStart` body on the right.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, ts-fsrs 5 (through `src/review/schedule.ts`), vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-deskmate-signin-design.md`

## Global Constraints

- Change the name only where people see it. Keep the repo, the `scholar` schema, code identifiers and client storage keys (`super('scholar')`, `scholar-mix-topics`, `scholar-essay-draft-`, `scholar-shell-v1`).
- Headline: "Study a little. Remember it for good."
- No AI call, no network request and nothing saved from the try-card.
- Spacing copy is computed by `applyRating` with `makeScheduler(false)`, never hard-coded.
- Follow the Study Desk tokens and motion in `DESIGN.md`. WCAG 2.2 AA. No streak or guilt copy.

## Review Focus

- An empty or whitespace answer: Check stays disabled, and nothing is graded.
- Article and case variants ("The Mitochondria", "mitochondria."): counted right.
- A near-miss typo ("mitocondria"): counted right through fuzzy matching, like review.
- Keyboard only: Enter in the field checks the answer, the result is announced, and "Try another" moves focus back to the new field.
- Demo mode: the right column is "Try the demo", and the try-card still works.

---

### Task 1: Rename the visible brand to Deskmate

**Files:**
- Modify every user-visible "Scholar" string listed by `grep -rn "Scholar" src`, except `src/review/store.ts`: the manifest name and short_name, the `page.tsx` title suffix, `nav.tsx`, login, onboarding, privacy, reset-password, profile, the messages in review, triage, feynman, card-list, transfer and mic-button, report-problem, new-essay-form, and `ADULT_ERROR`. Comments may be renamed too.
- Modify `src/app/(app)/profile/your-data.tsx`: the download becomes `deskmate-data-<date>.json`.
- Tests: update the existing expectations in `tests/app/*` and `tests/lib/onboarding.test.ts` that assert "Scholar".

- [ ] Step 1: Update the test expectations to "Deskmate", for example `manifest.test.ts` expects `{ name: 'Deskmate', short_name: 'Deskmate' }` and `app-page.test.tsx` expects the title `Today · Deskmate`. Run `npx vitest run tests/app tests/lib/onboarding.test.ts`. Expected: they fail.
- [ ] Step 2: Replace the strings. Run the same command. Expected: pass. `grep -rn "Scholar" src` should list only `store.ts` and code comments.
- [ ] Step 3: Commit `feat: the app is now called Deskmate (everything people see; schema, repo and storage keys unchanged)`.

### Task 2: TryCard and the two-column sign-in

**Files:**
- Create: `src/app/login/try-card.tsx` (client), `tests/app/try-card.test.tsx`
- Create: `src/lib/try-card.ts`: `TRY_CARDS`, `isRight`, `spacingIfRight`. Test: `tests/lib/try-card.test.ts`
- Modify: `src/app/login/login-form.tsx`, `src/app/login/demo-start.tsx`: wrap both in a shared two-column layout. Drop `CardStackHero` from sign-in.

**Interfaces:**
- `TRY_CARDS: { front: string; answers: string[]; deck: string }[]` has 3 cards with short answers. Use the mitochondria, diffusion and Watt's condenser cards from `src/lib/demo/content.ts`.
- `isRight(answer: string, answers: string[]): boolean` is true when `checkBlank(answer, a)` or `sameAnswer(answer, a)` is true for any accepted answer. Both come from `src/review/formats.ts`.
- `spacingIfRight(now: Date, steps = 4): number[]` returns the gaps in ms between successive due dates when a new card is rated Good each time it comes due.
- `formatGap(ms: number): string` returns "10 minutes", "about 2 days", "about a week" or "about 3 weeks". It lives in the same file.

- [ ] Step 1: Write `tests/lib/try-card.test.ts`. It asserts that `isRight('The Mitochondria.', ['mitochondria'])` is true, `isRight('mitocondria', ['mitochondria'])` is true, `isRight('ribosome', ['mitochondria'])` is false and `isRight('  ', ['mitochondria'])` is false. It also asserts that `spacingIfRight(now)[0]` is 10 minutes and that the gaps strictly increase.
- [ ] Step 2: Write `tests/app/try-card.test.tsx`. It asserts that Check is disabled when the field is empty. Typing "mitochondria" and pressing Enter shows a status containing "Right." and "10 minutes". A wrong answer shows "Not quite.", the answer and "comes back in a minute". "Try another" shows a different question and focuses the field.
- [ ] Step 3: Run both test files. Expected: they fail.
- [ ] Step 4: Implement `src/lib/try-card.ts` and `try-card.tsx`. The card has the index-card look: white stock, a 2px ink frame, the red top rule, ruled lines, and `.card-in` motion. The answer field is labelled "Your answer". The result sits in `role="status"`. "Right." gets `.ink-draw` and the lime mark.
- [ ] Step 5: Lay out sign-in. Below 768px: the form, then the card. From 768px: the left column has "Deskmate" with the stripe, the headline as the page h1 (written in with `hand-write`) and TryCard; the right column has the existing form content. `LoginForm` keeps its mode heading as an h2. Existing tests in `tests/app/login.test.tsx` must still pass; update the heading queries if needed.
- [ ] Step 6: Run `npx tsc --noEmit` and `npm test`. Expected: pass.
- [ ] Step 7: Check in a browser at 390px and 1280px, light and dark, in normal mode and `DEMO_MODE=true`.
- [ ] Step 8: Commit `feat: sign-in leads with a card to try (answer checked on the device, real spacing shown)`.

### Task 3: Demo service, portfolio and docs

- [ ] Step 1: Create the Render service `deskmate-demo` through the API with the same settings as `scholar-demo` and `SITE_URL=https://deskmate-demo.onrender.com`. Update `render.demo.yaml`, `docs/deployment-render-demo.md` and the keep-alive URL references. Check `/api/keep-alive` and "Try the demo" live.
- [ ] Step 2: Portfolio `src/content/projects/scholar.md`: title "Deskmate" and the new demo link (commit on `astro-build`; the slug stays).
- [ ] Step 3: Update `PROGRESS.md`, `CLAUDE.md` (the title line) and `DESIGN.md` (the sign-in background sentence). Ask the owner before deleting the old `scholar-demo` service.
