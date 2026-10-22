# Phase 2 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the deferred findings from 2a–2c that a student would notice: wrong or stale text, screen-reader gaps, misleading numbers. Also tune the two prompts that browser QA flagged.

**Architecture:** Small fixes in place. No new tables or features. One new LLM setting is changed (two prompts), with eval rows. 2d stays blocked on capacity.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-10-20-scholar-design.md`. The findings come from the final-review ledgers summarized in PRs #5, #6 and #7.

## Global Constraints

- **Earlier rules still apply:** CLAUDE.md, the earlier plans' Global Constraints, and the token-budget rule (re-run the eval for any prompt change and add a row).
- **Scope:** every task fixes an existing behavior. No new features.

## Review Focus

1. **A revised feedback item shown anywhere:** the card heading, focus mode, the self-check's top priority, or the next draft's re-check. Expect the revised wording everywhere, with the original still visible on the card. Tested in Task 1.
2. **A keyboard user arrowing through the forgetting curve.** Expect each day's values to be announced. Tested in Task 2.
3. **A student with more than 1,000 feedback items or cards.** Expect Progress figures computed from all of them, not a silent 1,000-row cap. Tested in Task 3.
4. **A feedback comment that merely mentions "cite" or "run".** Expect it not to be counted as a citation or run-on pattern. Tested in Task 3.
5. **Translation of a summary that lists items.** Expect every listed item kept. Tested in Task 4 by the eval sample.

---

### Task 1: Revised summaries everywhere (2b)

**Files:**
- `src/app/(app)/write/[essayId]/feedback-card.tsx`
- `src/app/(app)/write/[essayId]/essay-view.tsx`
- `src/lib/essay/analyze.ts`
- `src/app/(app)/write/[essayId]/page.tsx`

**Changes:**
- **Card:** the heading (the card's accessible name) shows the revised summary. The original appears below it as "Original: …" in muted text.
- **Self-check:** its top priority uses `revised_summary ?? summary`.
- **Re-check judging:** sends `revised_summary ?? summary` as the item summary.
- **Page load:** re-parses the self-assessment with `parseSelfAssessment`, so a tampered row shows nothing instead of crashing the page.

**Tests:**
```ts
test('a revised card is named by its revised summary and shows the original below', ...);
test('the self-check top priority uses the revised summary', ...);
test('re-check judging sends the revised summary for a revised item', ...); // db
```
**Commit:** `fix: revised feedback wording everywhere it shows`

### Task 2: Small robustness and accessibility fixes (2a, 2b)

**Changes:**
- **Read-aloud** (`read-aloud.tsx`): an `onerror` calls `speechSynthesis.cancel()` before going idle, so the controls never show "stopped" while speech continues.
- **Forgetting curve** (`mastery-view.tsx`): adds a visually hidden `role="status"` that reads the hovered day ("{day}: {x}% reviewed, {y}% stopped") while the chart has focus.
- **Cleanup:** removes the unused `disputeItem` server action and its tests.

**Tests:**
```ts
test('a speech error cancels the rest of the queue and clears the highlight', ...);
test('arrowing through the forgetting curve announces each day', ...);
```
**Commit:** `fix: read-aloud error stop, announced chart readout, dead dispute action`

### Task 3: Growth accuracy (2c)

**Changes:**
- **Pattern rules** (`patterns.ts`):
  - run-on: `\brun[- ]on\b`;
  - citation: `/citation|cite (?:your|the|a) source|\bcit(?:e|ing|ation) (?:format|style)|source format|in-text/`.
- **Rubric labels:** become "Thesis", "Evidence", "Analysis", so they claim no more than the data shows.
- **Template wording:** the ambiguous topic-sentence card reads "Read the paragraph without it. If every other sentence supports the topic sentence's point, it fits."
- **Calibration copy** (`progress-view.tsx`): when 1–2 criteria were compared, it reads "Rate at least 3 criteria yourself to see this."
- **Practice button:** one shared "adding" state across all Practice buttons, so two first-time taps can't create two decks.
- **Progress reads** (`progress/page.tsx`):
  - feedback items filtered on the server to `highest_level > 0`, with a high explicit limit;
  - the leech rate computed from two exact counts (`count: 'exact', head: true`).
- **Practice cards:** the review note labels their quote "Example:", not "From your notes:", when the card has no source chunk.

**Tests:**
```ts
test('cite and run only count when they name the pattern', ...);
test('the essays line asks for 3 rated criteria when 1–2 were compared', ...);
test('while one Practice request runs, every Practice button is disabled', ...);
test('a practice card's sure-but-wrong note says Example:', ...);
```
**Commit:** `fix: growth pattern accuracy, copy and bounded progress reads`

### Task 4: Prompt tuning from 2b QA

**Changes:**
- **`translateFeedbackPrompt`:** "Keep every point and every listed item; do not shorten or summarize."
- **`itemDialoguePrompt`:** "When the feedback stands, acknowledge the student's reason first, then explain, without words like 'just' or 'still'."

**Verification:** re-run the `translate_feedback` and `item_dialogue` eval cases on the sample whose translation dropped a list, and add the token-budget rows. Gate: no dropped list item, no "just" or "still" phrasing, and output tokens up by at most 15%.

**Tests:**
```ts
test('translate prompt asks to keep every listed item; dialogue prompt asks to acknowledge the reason first', ...);
```
**Commit:** `fix: fuller translations and kinder dispute replies`
