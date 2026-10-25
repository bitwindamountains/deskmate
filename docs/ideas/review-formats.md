# More ways to answer a card in review

## Problem Statement
How might review offer more ways to answer a card (multiple choice, fill in the blank, reverse, true/false, matching) without the easier formats making FSRS think a card is known when it isn't?

## Recommended Direction
Five formats, all built on the device from what a card already has (front, back, key points, concept, FSRS state): **0 LLM tokens**.

1. **Format ladder** (the core). The app picks the format from the card's strength: new or lapsed cards get multiple choice, learning cards get fill in the blank, solid cards get typed recall. Easier formats count less: a right multiple-choice answer is at most Hard, a right blank at most Good. The student can switch to a harder format, never an easier one.
2. **Fill in the blank** from `key_points`: blank a key point inside the answer. Falls back to typed recall when no key point appears word for word.
3. **Multiple choice** in review, reusing the practice test's distractor logic (`src/review/practice-test.ts`), with distractors taken first from cards on the same concept so they are plausible. Needs 3 distinct other answers; otherwise the card skips it.
4. **Reverse** (answer → question) for basic cards, self-rated, so it never costs a grading call.
5. **Warm-up round** with true/false and matching, outside the schedule: it never writes a review or touches FSRS.

Recognition formats are a stepping stone (scaffolding that fades as the card gets stronger), not a replacement for recall. Recall is what FSRS models, so the ladder and the rating caps are what keep the scheduler honest.

## Key Assumptions to Validate
- [ ] Most cards' key points appear word for word in their answers. Test: SQL over kept cards once real decks exist (on 2026-10-25 the database held only 6 kept test cards, 4 of them with a key point in the answer).
- [ ] Decks have 3+ distinct other answers, ideally on the same concept. Test: same SQL; the per-concept fallback goes to the whole deck.
- [ ] Capping easy formats at Hard/Good doesn't feel unfair. Test: a one-line note under the ratings, then ask beta students.
- [ ] Recognition-first doesn't slow learning. Test: compare lapse rates for cards first seen with multiple choice versus typed (the `grade_source` column records the format).

## MVP Scope
In: the ladder, fill in the blank, multiple choice (one PR); reverse; the warm-up round with true/false and matching. All on the device, all keyboard-accessible, all mobile first.
Out: everything below.

## Not Doing (and Why)
- **AI-written distractors**: costs tokens. If multiple choice proves too easy, revisit as one cached call per card (the "Ask it another way" pattern).
- **A free format picker**: students drift to the easiest format. Switching goes harder only.
- **True/false and matching in scheduled review**: a 50% guess rate is too noisy to feed FSRS.
- **Timed or streak modes**: no streak pressure (CLAUDE.md).
- **Essay prompts in review**: that's Draft Coach.
- **A setting to turn the ladder off**: the "harder format" switch covers it; add a setting only if beta students ask.

## Open Questions
- Should the ladder say why a card is multiple choice? Builder's call: yes, one short muted line ("New card: pick from options first").
