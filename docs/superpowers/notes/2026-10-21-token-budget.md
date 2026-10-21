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
