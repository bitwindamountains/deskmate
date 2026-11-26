---
name: Scholar
description: AI study app where the AI coaches and the student does the work.
colors:
  ground: "#f6f7fb"
  surface: "#ffffff"
  ink: "#1e3a8a"
  ink-muted: "#4a5a8c"
  line: "#6c7bb0"
  rule: "#eaeef8"
  rail: "#ffffff"
  rail-ink: "#4a5a8c"
  rail-ink-strong: "#1e3a8a"
  mark: "#1e3a8a"
  mark-strong: "#142a6b"
  on-mark: "#ffffff"
  accent: "#c0282d"
  focus: "#1e3a8a"
  danger: "#9b1c1c"
  selection: "#d5ddf0"
  layer-global: "#dbe7ff"
  layer-paragraph: "#f6e3c4"
  layer-sentence: "#f3dcf0"
  layer-strength: "#cdeed8"
  chart-idle: "#eb6834"
  chart-review: "#2a78d6"
  strength-strong: "#184f95"
  strength-shaky: "#3987e5"
  strength-weak: "#86b6ef"
  dark-ground: "#0e1430"
  dark-surface: "#151c3d"
  dark-ink: "#e6eaf8"
  dark-ink-muted: "#a9b3d9"
  dark-rail: "#0b1027"
  dark-mark: "#3f63d4"
  dark-mark-strong: "#3457c4"
  dark-accent: "#ff7a7a"
typography:
  display:
    fontFamily: "Patrick Hand, Atkinson Hyperlegible, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.03em"
  headline:
    fontFamily: "Patrick Hand, Atkinson Hyperlegible, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: "0.03em"
  title:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  control: "0.25rem"
  panel: "0.375rem"
  lg: "0.25rem"
  xl: "0.375rem"
spacing:
  gutter-phone: "16px"
  gutter-wide: "40px"
  panel-pad: "20px"
  panel-pad-roomy: "24px"
  column: "48rem"
  column-wide: "72rem"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.rule}"
  button-primary:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.on-mark}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.mark-strong}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  inlay:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
  nav-tab:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    height: "44px"
  nav-tab-current:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.accent}"
---

# Design System: Scholar

Mode: Operate (app UI). Tokens live in `src/app/globals.css`; this file is the reference later screens follow. Dark values in the frontmatter carry a `dark-` prefix; in code they are the same token names under `prefers-color-scheme: dark`.

## Overview

**Creative North Star: "The Study Desk"**

The app is a student's desk: ruled index cards, a ballpoint pen and a lime highlighter. Ballpoint blue ink on white card stock, framed in ink rules, with one printed colour (the brand-stripe red) and one marker (the highlighter). Everything on the page is something a student actually uses to study; there is no metaphor to decode. Today is one index card: reviews, then writing, with the day's minutes marked in highlighter.

Headings are hand-lettered block caps, like a heading written at the top of a page of notes. Everything the student reads stays in Atkinson Hyperlegible. Surfaces are flat: depth comes from ink rules, not shadows. Panels are cut card with near-square corners, not pills.

Dark mode is the same card under a desk lamp at night: navy stock, pale ink, the stripe still red. Both schemes are first-class; dark follows the OS.

**Key Characteristics:**
- Ballpoint blue text and rules on white stock; no Tailwind indigo.
- One printed accent, red, for the current place only (the current tab and the stripe).
- Hand-lettered caps for headings, Atkinson for all reading.
- 1.5px ink frames, 4-6px corners, no shadows.
- Ruling drawn per row, never behind text.

## Colors

Two inks on one stock: ballpoint blue for everything, printed red for "you are here".

### Primary
- **Ballpoint Blue** (ink): all text, panel frames, button borders, the primary fill (mark), the focus outline. 10.3:1 on surface.
- **Pressed Ballpoint** (mark-strong): primary button hover.
- **Night Ballpoint** (dark-mark): the dark-scheme primary fill, white text on it (5.3:1).

### Secondary
- **Brand-Stripe Red** (accent): the current nav tab and the three-bar stripe. 5.9:1 on surface. Nothing else.

### Neutral
- **Desk Ground** (ground): page background, a cool off-white.
- **Card Stock** (surface): panels and fields.
- **Faded Ballpoint** (ink-muted): secondary text (6.6:1).
- **Rule Line** (line): field borders and list dividers (at least 3:1).
- **Printed Ruling** (rule): the faint per-row ruling. Decoration only, never a text colour.
- **Ballpoint Wash** (selection): text selection.
- **Lime Highlighter** (highlight, `rgb(196 238 64 / 0.62)`; dark `rgb(150 190 30 / 0.38)`): the one marker. Today's time, mastery strokes and an essay passage linked to its feedback card. Ink stays at least 7:1 through it in light, 6:1 in dark.
- **Error Red** (danger): error messages, always with the "Error:" prefix.

### Kept from before
Draft Coach layer colours (layer-global, layer-paragraph, layer-sentence, layer-strength; used on labels, no longer as standing highlights in the essay) and chart and strength colours (chart-idle, chart-review, strength-*) carry over unchanged. They were validated earlier: text on layers stays ink (at least 7:1), chart colours are marks only, and every mark and layer has a text label.

### Named Rules
**The One Printed Colour Rule.** Red marks the current tab and the stripe. It is never a focus ring, a caret, a button fill, a link or decoration.

**The Never Alone Rule.** Colour is never the only signal. The current tab is also bold, carries `aria-current="page"` and gets a bar or stripe; errors carry "Error:"; layers and chart marks carry text labels.

## Typography

**Display Font:** Patrick Hand (with Atkinson Hyperlegible, sans-serif)
**Body Font:** Atkinson Hyperlegible 400/700 (with system-ui, sans-serif)

**Character:** A thin ballpoint hand for the headings you would write at the top of your notes, set against a face built to be read. Patrick Hand ships one weight, so headings get a 0.035em text stroke to look pressed.

### Hierarchy
- **Display** (Patrick Hand 400, 2.25rem, 3rem from 768px, line-height 1.25, caps, 0.03em): the page h1, on a doubled ink rule (5px double) like a heading ruled off in a notebook.
- **Headline** (Patrick Hand 400, 1.5rem, caps, 0.03em): section h2s; Today's date line uses 1.25rem.
- **Title** (Atkinson 700, 1.2rem): lead lines such as the card count or the open essay title. A review card's question is Atkinson 700 at 1.44rem.
- **Body** (Atkinson 400, 1rem, line-height 1.5): all running text, max `max-w-prose`.
- **Label** (Atkinson 400 or 700, 0.875rem): meta lines, nav tabs on phones, Today's time. 0.75rem for chart axis days.

### Named Rules
**The Hand For Heads Rule.** `.hand` is for headings only, never for running text, labels, buttons or card content.

**The Dyslexia Override Rule.** Under the dyslexia option (OpenDyslexic, line-height 1.6), `.hand` turns off: OpenDyslexic 700, no caps, no letter spacing, no stroke. Headings keep their size.

**The Running Time Rule.** Tabular figures (`tabular-nums`) only on running times and Today's time, where digits line up in a column. Nowhere else.

## Layout

Mobile first. Page gutter 16px on phones, 40px from 768px. The main column is 48rem; two-column screens (the essay beside its feedback) widen to 72rem. On phones the bottom padding (7rem) clears the tab bar, which adds `env(safe-area-inset-bottom)`; the root viewport sets `viewport-fit=cover`.

Each page is the nav, then one main landmark with one h1. Sections stack with 2rem between them. Panels pad 20px (24px for empty states). Inside Today's card, rows pad 20px across and 16-20px down, and sections are split by 1.5px ink rules.

Touch targets are at least 44px (`min-h-11`, `.btn`, `.field`); list rows at least 44-48px.

## Elevation & Depth

Flat. There are no shadows. Depth comes from 1.5px ink frames around panels, 1.5px ink rules between sections, and the faint per-row ruling. The page ground is a shade off the white stock and carries a paper-fibre grain (`--fibre`: fractal noise in the ink's own hue at a few percent, light and dark), so panels read as clean card stock laid on a fibrous desk. The grain is decoration only and never sits behind text inside a panel.

### Named Rules
**The Ruled Row Rule.** Ruling is drawn per row as a 1px rule-colour bottom border (`.ruled`), like the lines on an index card. Never paint ruling as a background behind text.

## Shapes

Cut card, not pill. Controls and fields have a 0.25rem corner; panels 0.375rem. Tailwind's `rounded-lg` and `rounded-xl` are overridden in `@theme` to those two values, so every existing panel takes the index-card corner. Borders are 1.5px: ink on panels and buttons, line on fields. The page h1 sits on a 5px double ink rule.

The brand stripe is the one recurring mark: three red bars, 3px wide with 3px gaps, in a 1.25rem by 1rem box. It sits beside "Scholar" in the side rail, beside the current tab from 768px, and in the header of Today's card.

## Components

### Buttons
Plain, inked, square-ish.
- **Shape:** near-square corner (0.25rem), 1.5px ink border, at least 44px tall, Atkinson 700.
- **Plain:** ink text on no fill; hover fills with printed ruling.
- **Primary:** ballpoint fill (mark), white text; hover to pressed ballpoint. One primary per area.
- **Focus:** 4px double ink outline, 2px offset. A `.btn` label around a hidden input (confidence chips, answer options) shows the ring when its input has focus; the chosen option becomes primary.
- **Disabled:** 60% opacity, not-allowed cursor.

### Inputs / Fields
- **Style:** white stock, 1.5px line border, 0.25rem corner, 44px tall, muted placeholder.
- **Focus:** the same double ink outline, 1px offset.
- **Checkboxes and radios:** drawn, not the browser's: 1.25rem, 1.5px ink frame on card stock (radios round); a checked box fills with the primary ink and a white pen tick, a checked radio takes an ink dot. In 44px labels. Forced-colours mode falls back to the system controls.
- **Error:** `.error`, danger colour, bold, "Error:" prefix, `role="alert"`.

### Cards / Containers (the index card, `.inlay`)
- **Corner Style:** 0.375rem.
- **Background:** surface.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1.5px ink.
- **Internal Padding:** 20px, 24px for empty states.
Used app-wide for panels. Do not nest index cards.

### Navigation
- **Phones:** bottom tab bar on rail white, 1.5px ink rule on top, five tabs. The current tab is red and bold with a 3px red bar along its top.
- **From 768px:** a side rail, a 14rem sticky column with a 1.5px ink rule on its right, "Scholar" in hand caps with the stripe. The current tab is red and bold with the stripe before it.
- **Other tabs:** faded ballpoint; hover to full ink and underline. Colour transitions 150ms.

### Today's card (signature)
The day's plan as one index card.
- **Header:** the date in hand caps, "N min a day" and the stripe on the right, a 1.5px ink rule below.
- **Reviews, then Essays:** hand h2s, the word underlined at 1.5px. Reviews shows the card count and "~N min" right-aligned on a ruled row, then Start review. Essays shows "~N min left".
- **Writing time** is the daily minutes minus review, labelled "left". Never show it as an estimate.
- **Foot:** "Today's time" and "Reviews ~x · Writing ~y of N min", then highlighter strokes along a 1px ruled line: reviews in full lime, writing paler after a small gap. The strokes are hidden from screen readers; the sentence carries the facts.
- **Motion:** the strokes are laid on left to right (`.hl`, 520ms), writing 380ms after reviews, then stop. Reduced motion shows them laid.

### Progress bars
Review progress is a 10px bar: 1px ink frame, solid ink fill, hidden from screen readers next to a "Card N of M" line. Mastery strength bars are short highlighter strokes in the strength colours (`.hl`), drawn on as the map opens; "Not started" stays an empty dashed box.

### Ruled lists
Exams and similar lists sit under a 1.5px ink rule, each row at least 48px with a 1px line rule below, actions as underlined links.

## Do's and Don'ts

### Do:
- **Do** use ink for text, frames and the primary fill; red only for the current tab and the stripe.
- **Do** draw focus as a 4px double ink outline with a 2px offset.
- **Do** frame panels as index cards (`.inlay`): white stock, 1.5px ink, 0.375rem corner.
- **Do** draw ruling per row with `.ruled`.
- **Do** set headings in `.hand` and everything read in Atkinson.
- **Do** pair every colour signal with text, weight, shape or `aria-current`.
- **Do** keep motion to state and one authored moment: colour transitions 150ms `cubic-bezier(0.16, 1, 0.3, 1)`; buttons press 1px down on `:active`; a new review or warm-up card slides in from the left (`.card-in`, 280ms clip-path reveal); revealing an answer turns the card over from its top edge (`.flip-in`, 380ms); "Right." / "Not quite." get an ink underline drawn under them (`.ink-draw`, 320ms); Today's highlighter strokes are laid on once. On every page the heading is written in by hand, left to right (`.hand-write`, a 560ms clip reveal of the words at a pen's steady pace), and its doubled ink rule is drawn under it (`.rule-draw`, 420ms, from 260ms) and the current tab's red mark is written in (`.mark-in`, 240ms); lists that arrive as lists (decks, essays, concepts, writing patterns, missed test questions) come in one row after another (`.track-in`, 260ms per row, 45ms apart, capped at the eighth row); triage and practice-test cards slide in like review cards; a practice-test score is stamped in with an ink underline. Selected test options ink their frame like review options. Background: three ruled index cards (`src/components/card-stack.tsx`), white stock in a 2px ink line at 22%, fanned on the desk in the right margin inside the app (1024px and up) and large beside the form on password reset (sign-in leads with a card to try instead: `src/app/login/try-card.tsx`, owner 2026-11-27) (onboarding shows it only from 768px: on phones its long form would scroll over the cards). They are dealt into the fan as each page opens (`.deal`, 560ms, 90ms apart), then stay still. A finished review squares the cards just reviewed into a small pile and draws a pen tick over it (`.pile`, `.tick`). In triage, a dragged card follows the finger and tilts; a kept card flies off to the right and a discarded one to the left while the next slides in. Essay passages are not highlighted at rest (owner, 2026-11-26: when every paragraph was marked, nothing stood out). Pointing at or tabbing into a feedback card lays a highlighter stroke over its passage and shows the mark's layer label (`mark[data-linked]`, 320ms); so do Show in essay (the mark takes focus) and focus mode (`mark[data-focus]`). Interactions: a button hover fills the key from the left with a 10% ink tint (220ms), link underlines press from 1px to 2.5px, a linked index card doubles its frame with an inset ink line, fields ink their border on hover and while typing. Honour reduced motion from the OS and the profile.

### Don't:
- **Don't** use red for focus, carets, links, buttons or decoration.
- **Don't** use Tailwind indigo; the dark primary is night ballpoint with white text.
- **Don't** add shadows or soft, pill-round panels.
- **Don't** put metaphors on the desk. Every object and motion is something a student uses to study (index cards, pen, highlighter); the ground carries only the card stack.
- **Don't** use the highlighter for anything but marking: Today's time, mastery strength and linked essay passages.
- **Don't** paint ruling behind text.
- **Don't** set running text, labels or card content in the hand face.
- **Don't** use tabular figures outside running times and Today's time.
- **Don't** present writing time as an estimate.
