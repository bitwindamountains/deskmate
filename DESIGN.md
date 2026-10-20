# Design

Mode: **Operate** (app UI). Tokens live in `src/app/globals.css`; this file is the reference later screens follow.

## Direction: Highlighter on ink

A student's desk at night: dark ink on a cool page, and one highlighter stroke on the thing that matters right now. The shell is a deep-ink rail (sidebar from 768px, bottom tab bar below). Content sits on a cool, slightly green-grey ground, never cream.

**Signature move:** the highlighter mark. A lime band with an uneven, hand-swiped radius (`rounded-[0.3rem_0.8rem_0.35rem_0.7rem]`) marks the current nav item; the same lime fills the primary action and text selection. It means "this one, now". Never use it for decoration or on inactive states. It never works alone: the current item is also bold and carries `aria-current="page"`.

Light vs dark: phones in class by day, in bed at night. Both are first-class; dark follows `prefers-color-scheme`. The rail stays dark in both.

## Color roles

| Role | Light | Dark | Use |
|---|---|---|---|
| `ground` | #f4f6f3 | #10161f | page background |
| `surface` | #ffffff | #18212d | panels, fields |
| `ink` | #18263a | #e7ecf2 | text, button borders |
| `ink-muted` | #475569 | #a9b4c2 | secondary text (≥ 6.9:1) |
| `line` | #6b7787 | #7d8a9b | field and panel borders (≥ 4.5:1 on surface) |
| `rail` | #18263a | #0a0f16 | nav background |
| `rail-ink` / `rail-ink-strong` | #c8d2de / #fff | #aab5c3 / #fff | nav text |
| `mark` / `on-mark` | #d4f25a / #18263a | #cdeb52 / #10161f | highlighter: current item, primary action, selection (≥ 12:1) |
| `focus` | #1d4ed8 | #cdeb52 | focus ring; `mark` inside `.rail` |
| `danger` | #9b1c1c | #fca5a5 | errors; always prefixed "Error:" (`.error`) |

All text pairs are ≥ 4.5:1 in both themes (checked numerically). Colour is never the only signal.

## Type

One family: Atkinson Hyperlegible (400/700, `next/font`). Dyslexia option: OpenDyslexic (`@fontsource/opendyslexic` 5.3.0, OFL, self-hosted), applied when the `(app)` root has `data-font="dyslexic"` (`body:has(...)` lifts it to body), line-height 1.6.

Fixed rem scale, ratio 1.2: 0.875 · 1 (body, line-height 1.5) · 1.2 (`text-xl`, section heads) · 1.44 (h2 on list pages) · 1.728 (page h1). Headings `text-balance`, prose `max-w-prose`.

## Space, shape, targets

Tailwind 4px scale. Page gutter 16px on phones, 40px from 768px; main column max 48rem. Bottom padding clears the tab bar (`pb-28`). Radii: 0.5rem controls, 0.75rem panels, the uneven highlighter radius for the mark only. Touch targets ≥ 44px (`min-h-11`, `.btn`, `.field`). The tab bar adds `env(safe-area-inset-bottom)`; the root viewport sets `viewport-fit=cover`.

## Components

- `.btn` (bordered, ink) and `.btn btn-primary` (mark fill). Hover inverts to ink fill. Disabled 60% opacity.
- `.field` for inputs and selects; checkboxes/radios 1.25rem with `accent-color: ink`, wrapped in 44px labels.
- `.error` for messages (`role="alert"`, "Error:" prefix).
- Empty state (`src/components/empty-study.tsx`): heading, one teaching sentence, one primary action. Panels are bordered `surface`, no shadows, no nesting.
- `AppPage` (`src/components/page.tsx`): `<Nav>` then `<main id="main">` with one h1. Skip link "Skip to content" in the `(app)` layout.

## Focus and motion

Focus: `3px solid var(--focus)`, offset 2px, on `:focus-visible` everywhere.

Motion conveys state only: colour transitions 150ms, `cubic-bezier(0.16, 1, 0.3, 1)`. No entrance animations. Reduced motion is honoured from the OS (`prefers-reduced-motion`) and from the profile (`data-reduced-motion="true"`); both cut transitions and animations to ~0.
