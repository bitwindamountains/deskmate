# Phase 2: Differentiators (overview and split)

**Source:**
- Brief Part G, Phase 2: Draft Coach A3.1–A3.12, Recall B3.1–B3.10, and the shared Part C integration loops.
- Spec notes:
  - §6.4: paraphrases are generated lazily.
  - §6.1: `card_critique` is a future task.
  - §8.1: the "I disagree" rebuttal is deferred to Phase 2.
  - §8.3: the essay → cards template bank.
  - §4: on-device Whisper for speech.

**Why split.** Phase 2 is 22 features plus the integration loops, across two tools that are largely independent. Their costs on the free tier differ a lot. Some are pure code; some need an extra LLM call per student action; some need speech or OCR models. Following the plan-writing rule (one plan per subsystem, each shipping working software), Phase 2 is four sub-plans. They're ordered by **value per free-tier token** **[call]**:

| Plan | Contents | LLM cost | Why this order |
|---|---|---|---|
| **2a: Recall depth** (`2026-10-21-phase2a-recall-depth.md`) | Deck and card editor (B-S8, a gap left from 1a), confidence before reveal and a calibration score (B3.2), leech rescue and mnemonics (B3.3, B3.8), mastery map and forgetting curve (B3.4, B3.5), interleaving (B3.9), the rest of the session summary (B-S6) | One cached, on-demand call per card the student asks help for; everything else is code | The daily habit is the product's base, and almost all of it runs without an LLM. B3.10 (offline) already shipped in 1a. |
| **2b: Draft Coach depth** | "I disagree" dialogue (A3.10), Ask a question (A2.9, deferred from 1b), prompt alignment (A3.3) and reverse outline (A3.2) folded into the existing two passes, self-assessment and calibration (A3.7), first-language explanations (A3.9), read-aloud (A3.11, browser speech) | Disagree, Ask and translation cost one call per student action; alignment and outline add output to calls already being made | Mostly cheap. Read-aloud is free (`speechSynthesis`). |
| **2c: Growth and loops** | Growth profile (A3.5), essay → cards from a hand-written template bank (C1, spec §8.3), flashcards → essay prompts (C1), one shared learner profile and calibration score (C2) | No LLM calls per student (template bank). Essay prompts reuse Draft Coach checks. | Needs 2a's calibration and 2b's self-assessment first. |
| **2d: Heavy AI and media** | Argument map (A3.1), citation checker (A3.4), reader personas (A3.6), voice preservation (A3.8), handwriting OCR (A3.12), question rephrasing (B3.1), spoken answers (B3.6), Feynman mode (B3.7), Phase 2 card types (B2.3) | Several calls per essay or card, plus speech and OCR models | **Blocked on the capacity decision** (paid tier, second provider, or queue). On today's ~2 essay checks a minute these would crowd out core feedback. |

**Detailed plans:** only 2a is written now. Each later plan gets its detailed tasks when its turn comes, so it argues from the code as it is then rather than guessing at interfaces 2a hasn't built yet.

**Rules that carry through every sub-plan:**
- **CLAUDE.md's hard rules apply.**
- **Before changing any prompt or adding an LLM task**, read `docs/superpowers/notes/2026-10-21-token-budget.md`, run the eval, and add a row.
- **Every new LLM output** uses `compactSchema`. It is anchored or grounded in the student's own text, and dropped if it can't be.
- **Every new LLM call** is cached, and takes the per-user daily quota before the call, never after.
