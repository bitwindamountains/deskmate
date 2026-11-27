# Deskmate: rename and sign-in redesign (short design)

Owner, 2026-11-27: "Scholar" is too saturated, so rename the app to **Deskmate** (chosen from candidates with no study app of that name found; not a trademark search). Redesign the sign-in page, which was "too simple" and whose faded blank card stack looked bad. A first-time visitor should understand that the app helps them **actually learn and build a study habit**, and that it's **easy**.

## Approaches

The owner was shown three sign-in directions as mockups (visual companion, `signin-directions.html`) and picked **A**.

- **A. Try one card right here (picked).** A real flashcard to answer before signing in. Trying it proves "it helps and it's easy" better than describing it. It needs no AI and no account.
- **B. Today's plan.** A filled-in Today card ("11 cards, about 5 minutes"). It shows that the plan is small, but it only describes the app.
- **C. Notes in, cards and feedback out.** Explains the pipeline at a glance. Busier, and also descriptive.

## Decisions

- **The rename covers what people see:**
  - in the app: page titles, the manifest, the logo text in the rail, every message that names the app, `/privacy`, the onboarding notice, the data download name (`deskmate-data-<date>.json`);
  - outside the app: the portfolio entry, and a new Render service `deskmate-demo`.
- **Unchanged:** the repo, the `scholar` database schema, code names, and client storage keys (IndexedDB `scholar`, localStorage `scholar-*`, the service-worker cache). Renaming the storage keys would orphan offline data.
- **Sign-in layout:**
  - from 768px: two columns. The left has the Deskmate name with its red stripe, the hand-lettered headline "Study a little. Remember it for good." and the try-a-card. The right has the existing form, unchanged in behaviour, or "Try the demo" in demo mode.
  - on phones: the form first, then the card.
  - `CardStackHero` is removed from sign-in. The in-app background stays.
- **Try-a-card:**
  - three fixed sample cards; "Try another" moves to the next;
  - a labelled answer field and a "Check" button;
  - the answer is checked on the device with review's own matching (`checkAnswer`-style: normalized exact or fuzzy). No AI, no request, nothing saved.
  - **Right:** "Right." with the ink underline and a highlighter mark, plus the spacing it would get if you keep getting it right, computed by the real scheduler (`applyRating` with Good, repeated): "10 minutes, then about 2 days, then about a week…". It's computed, never hard-coded.
  - **Wrong:** "Not quite.", the answer, and "A miss comes back in a minute."
  - The result is announced with `role="status"`. Keyboard and screen reader friendly. Reduced motion is honoured.
- **Theme:** Study Desk tokens and motion from `DESIGN.md`. The card is a real index card (white stock, ink frame, red top rule, ruled lines). No new colours.

## Non-goals

- No changes to the auth flow or Supabase settings.
- No new AI call.
- No streak or guilt copy.

## Left to the builder

- The exact sample cards. They come from the demo content and should have short answers that are easy to match.
- Spacing details, and how the dark theme looks.
