# Essay eval on Groq (Phase 1b, Task 1)

**Run:** `eval/out/slow-2026-10-21T05-01-03.964Z/`. One essay per minute on `groq` (`openai/gpt-oss-120b`), 5 synthetic essays (`eval/samples/essays/sample-01..05.txt`; samples 02–05 were added for this run).

**Result:** all 10 calls returned valid JSON. 49 of 50 items could be anchored to the essay (1 dropped, in sample-03's paragraph pass).

## Capacity finding (affects production)

The first run, which sent calls back to back, was rate-limited by Groq: 8 of 10 essay calls failed with 429. These essays are 90–170 words, and each call used about 2,300–3,300 tokens (prompt plus output). A 2,000-word essay will need more.

- On this free tier, Draft Coach can serve only about **one essay check a minute, across all users**. There's also a daily token cap.
- The router fails over only to providers marked `trainsOnInputs: false`. For real essays that's Groq and Ollama (local, not in production). So when Groq is limited, there's no fallback.
- **Proposed** (Task 4 ruling): add a second Groq model to the essay routes. Groq applies limits per model, so this roughly doubles capacity at no cost. When every provider is busy, show a clear "busy, try in a minute" message (already in Task 5).

## Rating (1 = poor, 3 = good)

Pre-rated by the implementer. **The owner's rating decides the gate:** at least 4 of 5 essays need a useful Top 3.

| Essay | Type | Specific | Anchored | Kind | No rewriting | Top 3 useful? | Notes |
|---|---|---|---|---|---|---|---|
| 01 phones | argumentative | 3 | 3 | 3 | 3 | yes | Evidence, analysis, and conclusion: the right three. |
| 02 attendance | argumentative | 3 | 3 | 3 | 3 | yes | Found the vague thesis, unsupported claims, and the cousin anecdote. Missed the comma splice (that's the sentence layer's job). |
| 03 vaccines | expository | 2 | 3 | 3 | 3 | partly | Rightly flags the off-topic safety claim. But it asks an expository essay for an "arguable position": the eval sends every sample as `argumentative`. |
| 04 personal statement | personal | 2 | 3 | 3 | 3 | yes | The thesis point is good. "Add quantitative impact (earnings)" is a weak fit for a personal statement. |
| 05 rent vs buy | compare | 3 | 3 | 3 | 3 | yes | Caught the "always go up" generalization and the missing position. |

**Implementer's read:** 4 of 5 useful, so the gate passes, pending the owner.

**Two prompt fixes are worth folding into Task 4, without blocking:**
1. Pass the real essay type, so expository and personal essays aren't judged as arguments. The app does this already; the eval doesn't.
2. Strengths sometimes speak about "the student" in the third person. Add "address the student as you" to `ITEM_RULES`.

## Gate decision

**The owner approved the gate (pass) on 2026-10-21**, on the ratings above.

## Re-run on the final prompts (spec J10)

The prompts changed after the gate (Phase 1b Task 4): `safety_concern`, `carried` judgement, and "address the student as you". Both Groq models were re-run, one essay per minute.

**`groq` (`openai/gpt-oss-120b`):** `eval/out/slow-groq-2026-10-21T06-46-02.505Z/`
- All 10 calls ok.
- Feedback now addresses the student as "you" (for example "You state a clear, direct position…").
- The Top 3 picks match the first run's quality on all 5 essays.
- Sample 01 dropped 3 global items whose quotes weren't in the essay. The anchoring guard did its job, and 7 items remained.

**`groq-small` (`openai/gpt-oss-20b`), added as a capacity fallback in Task 4:** `eval/out/slow-groq-small-2026-10-21T06-52-13.924Z/`
- Only 1 of 10 calls was ok.
- Groq itself rejected 7 of the essay calls with `json_validate_failed`; the other 3 failed with `schema_invalid` (missing `rubric_scores` and `items`).
- **Removed from every route.** As a fallback it would only add delay before the "busy" message.

## Open capacity risk

Real essays still have exactly one cloud provider, Groq `gpt-oss-120b`, at roughly **one essay check a minute across all users** on the free tier. When it's rate-limited, the student sees "Feedback is busy right now… try again in a minute." Options before a wider beta:
- a paid Groq tier;
- a second no-training provider whose terms allow student text;
- or a queue that runs checks in turn and tells the student when.
