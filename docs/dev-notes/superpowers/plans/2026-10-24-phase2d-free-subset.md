# Phase 2d, free-tier subset

**Goal:** build the Phase 2d features that fit the free tier (owner decision, 2026-10-24): they run on the student's device or cost one cached call per student action. The rest of 2d (argument map A3.1, citation checker A3.4, reader personas A3.6, voice preservation A3.8) waits for the capacity decision, because each adds calls to every essay check.

## Global constraints
- CLAUDE.md's hard rules. Free and open-source only, exact versions (`npm i -E`).
- Browser-only libraries are aliased to `src/lib/server-stub.ts` in `next.config.ts` and loaded with a lazy `await import()` (the pdf.js and sql.js pattern).
- Every new LLM call: static system prompt, compact shape, output grounded or anchored and dropped if not, the 60-a-day helper quota taken before the call, cached where it can be. A measured probe and a ledger row in `docs/superpowers/notes/2026-10-21-token-budget.md`.
- Photos and voice never leave the device. The privacy notice says so.
- Migrations only in `scholar` / `scholar_private`; DB tests and advisors after applying.

## Tasks
1. **Phase 2 card types (B2.3).** "Apply it" (scenario), "Compare" and "Put in order" join Q&A, fill in the blank and explain why. All are question-and-answer shaped, so review, grading, editing and export work unchanged. The `cards.type` check is widened, import offers the new types (off by default, so standard imports are unchanged), and the generation prompt describes them. Probe and ledger row. Commit: `feat: apply, compare and order card types`.
2. **Ask it another way (B3.1).** In review, "Ask it another way" shows a rewording of the question with the same answer. One call per card, cached on the card (`cards.variants`), so later reviews can use it free. Probe and ledger row. Commit: `feat: ask a card another way`.
3. **Feynman mode (B3.7).** From the mastery map, "Explain it" on a concept: the student explains it in their own words, and one call returns what they covered, what they missed and any misconception, judged only against that concept's cards and source passages. Missed points can become pending cards, grounded in the source, for triage. Probe and ledger row. Commit: `feat: Feynman mode`.
4. **Photo and handwriting import (A3.12, B2.1).** Recall import and the new-essay form accept a photo (.png, .jpg, .webp). Tesseract.js reads it on the device, and the text lands in the box for the student to correct before anything is saved (B7: "show an OCR preview and let the student correct it"). Commit: `feat: read photos of notes and handwritten essays on the device`.
5. **Spoken answers (B3.6).** A microphone button in review records an answer and turns it into text on the device (Whisper tiny through transformers.js, already a dependency). The text fills the answer box for the student to check. If the model can't load, the button says voice isn't available on this device. Commit: `feat: speak an answer in review`.
6. **Privacy notice, PROGRESS.md, review.**

## Review (`/code-review high --fix`) and follow-ups
- **Fixed by the review:**
  - A recording that ends after the card moves on is dropped, so its words never reach the next card's answer. A second click during the microphone prompt is ignored.
  - Editing a card clears its saved rewording.
  - The standard generation prompt shows the original three-type shape again (the six-type shape only when a Phase 2 type is picked), so the ledger's "unchanged" is true.
  - A failed Feynman card save still returns the feedback; new cards are filed under the concept the student explained.
  - The import form says "Reading your file…" while a photo or Word file is read.
- **Fixed after the review:**
  - "Put in order" answers with the steps in the wrong order scored full marks, because key points ignore order. When every step appears word for word, the order is now checked on the device (wrong order scores 0.4, Hard); when it can't be checked, the AI grader decides (tested).
  - Feynman mode found concepts only among the first 500 cards; it now pages through every kept card and loads details for the concept's cards only.
  - The explanation cap is 8,000 characters, so a long 600-word answer is judged by its word count.
