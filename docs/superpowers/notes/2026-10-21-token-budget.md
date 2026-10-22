# AI token budget (free tier)

Groq's free tier limits tokens per minute and per day, and output tokens count. Every change below was measured on the eval samples (`eval/samples`) against the same baseline, one change at a time. Kept only if tokens dropped **and** quality held. Rejected ideas stay listed so no one re-runs them.

## Where the tokens went (baseline: `openai/gpt-oss-120b`, Groq default reasoning)

One 170-word essay, probed directly:

| Call | Input | Of which JSON schema | Output | Of which hidden reasoning |
|---|---|---|---|---|
| essay_global | 1,122 | ~448 (40%) | 2,049 | 964 (47%) |
| essay_paragraphs | 805 | ~199 (25%) | 1,969 | 1,433 (73%) |

## Ledger

| Idea | Baseline → result (avg tokens per call) | Verdict | Why |
|---|---|---|---|
| `reasoning_effort: low` on Groq | essay_global out 2,184 → 1,164; essay_paragraphs out 1,580 → 754; card_generate out 2,069 → 1,206; grade_answer out 232 → 148. **One essay check 5,640 → 3,800 total (−33%)**; latency ~9.1 s → 5.7 s | **kept** | All 18 calls ok. Same core Top 3 issues on all 5 essays; fewer dropped quotes (3 vs 6); cards 11/11 grounded (vs 10/10); grades equivalent. Rubric scores vary ±1 between runs at both settings (existing run-to-run noise). Runs: `eval/out/slow-groq-2026-10-21T06-46-02.505Z` (medium essays), `effort-low-essays-2026-10-21T07-53-42.213Z`, `effort-medium-rest-…07-49-08…`, `effort-low-rest-…07-51-26…`. |
| `openai/gpt-oss-20b` as a second Groq model (capacity) | 1/10 essay calls ok | **reverted** | `json_validate_failed` / `schema_invalid` on the essay schemas (see the essay eval note). |
| Compact output shape in prompts (`compactSchema`) instead of the full JSON Schema | input: essay_global 1,097 → 825, essay_paragraphs 780 → 656, card_generate 585 → 476, grade_answer 421 → 347; output also fell (1,164 → 1,039; 754 → 564; 1,206 → 860; 148 → 125). **One essay check 3,795 → 3,084 (−19%)** | **kept** | All 18 calls ok and schema-valid. Top 3 still on each essay's core issues; cards 11/11 grounded; grades 0.95 easy / 0.45 hard (vs 0.95 / 0.5). The zod schema still validates every response, with one retry. Runs: `compact-low-essays-2026-10-21T08-03-45.603Z`, `compact-low-rest-2026-10-21T08-01-30.567Z`. |
| Groq prompt caching (cached input is free against rate limits) via a static system prompt | Probe: system prompt ~330-430 tokens; Groq caches in 512-token blocks. An identical essay prompt sent 10 min later hit 512 cached tokens; a different essay with the same system prompt hit 0; an identical prompt 4 s later hit 0. | **not adopted** | Our prompts are below one cache block, so different students' essays can't share a cached prefix, and even repeats hit unreliably. Padding prompts past 512 tokens to buy cache hits would be fragile. Re-check if Groq lowers the block size or our system prompts grow past ~600 tokens. |
| Re-check paragraph pass sends only the intro and the changed paragraphs (not the whole essay) | input 616-696 → 543-578 on 5 short samples (scales to roughly −2,000 on a 2,000-word essay); output unchanged | **rejected** | Quality loss: without the body in view, the model called conclusions unsupported ("provides no specific evidence") on samples 02 and 03. With full context it gave the right advice for a conclusion (restate the thesis, add a transition). |
| Hint rule: never a sentence the student could copy into the essay (browser QA found a ready-made thesis in Hint 2) | input essay_global 825 -> 864, essay_paragraphs 656 -> 695; output within noise (1,039 -> 1,097; 564 -> 672) | **kept** (quality, not tokens) | Ready-made sentences in hints: 5 of 80 -> **0 of 92**. Top 3 still on core issues; hints still actionable. Run: `noghost-low-essays-2026-10-21T09-03-35.794Z`. |
| Low effort vs medium on the re-check judgement (`carried`) | n/a | **no change** | On clear fixes (thesis, run-on, unsupported claim), low and medium both marked them addressed and left untouched items open. On a borderline partial fix, low said open and medium partial. An extra 'addressed means…' rule made it worse (items dropped from carried), so it was rejected. |
| Student-controlled grade level and deck subject moved from system prompts into the user message (review minor #8) | essay_global 864/1,097 -> 871/1,103; essay_paragraphs 695/672 -> 702/785; card_generate 476/860 -> 488/957; grade unchanged | **kept** (safety, not tokens) | Top 3 still on core issues; cards 10/10 grounded; grades 0.95 easy / 0.5 hard. Ready-made hint sentences 2/96 (one is generic transition words; one is a borderline sentence opener), vs 6% before the hint rule. Runs: `gradefix-low-essays-2026-10-21T09-16-23.338Z`, `gradefix-low-rest-2026-10-21T09-14-05.997Z`. |
| New task `card_help` (Phase 2a, B3.3/B3.8): static system prompt, compact shape, low effort | 519 in / 229 out (748 total, about 1 s) on the sample doc's first card | **kept** | Explanation from a new angle using only facts in the notes; honest mnemonic and analogy; no split for an atomic card (correct). Cached per card in `card_aids` and gated by the 60-a-day helper quota, so it is paid at most once per card. Run: `cardhelp-low-rest-2026-10-21T12-12-02.389Z`. |
| Prompt alignment in the global pass (A3.3, only when the essay has an assignment prompt; otherwise the field is left out of the shape) and a reverse outline in the paragraph pass (A3.2) (Phase 2b) | essay_global 871/1,103 -> 933/1,161 (+7% in, +5% out); essay_paragraphs 702/785 -> 807/819 (+15% in, +4% out) | **kept** | Alignment fitting on all 5 samples (e.g. sample-02 "take a clear position" partial; sample-01 "support it" partial). Outline covers every paragraph on 5/5, max 7 words, flags sensible (sample-04 conclusion `repeats`). Top 3 still on core issues. Two rejected wordings on the way: `flag: null` on every line cost +36% paragraph output (flag is now omitted unless it applies), and "every paragraph you report on" skipped a paragraph in 4/5. No extra calls. Runs: `outline3-low-essays-s01..s05-2026-10-22T00-1*`. |
| New task `item_dialogue` (Phase 2b, A2.9/A3.10): static system prompt per kind (question or dispute), compact shape (a question's shape is `reply` only), low effort | 448 in / 146 out (594 total, under 1 s) on a dispute of sample-01's top item | **kept** | Verdict `keep` with an honest reason (each paragraph needs its own support), names the kind of evidence to add without writing it, 72 words. Paid only when the student sends a message: one of the 60-a-day helper calls, at most 4 replies per item. Run: `dialogue-low-essays-2026-10-22T00-27-01.571Z`. |

## Net effect

One essay check (big picture + paragraphs) on the eval essays: **~5,640 → ~3,080 tokens (−45%)**, and faster (~9.1 s → ~5.5 s). Card generation output −58% (2,069 → 860), grading total −27% (653 → 472). On Groq's free tier, that's roughly 1.8× as many essay checks per minute and per day.

## Guards

- `tests/llm/essay-prompts.test.ts` pins `reasoningEffort: 'low'` on Groq.
- `tests/llm/compact-schema.test.ts` pins every prompt to the compact shape (never the raw JSON Schema).
- Any prompt or model change re-runs the eval (spec J10) and adds a row here.
