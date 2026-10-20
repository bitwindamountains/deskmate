# Evaluation samples

The files here are short synthetic texts written for testing. Add your own to make Phase 0 meaningful (design spec §7):

- `essays/*.txt`: up to 20 essays. An optional first line `Prompt: ...` becomes the assignment prompt. Separate paragraphs with a blank line.
- `docs/*.txt`: up to 5 study documents as plain text. Long documents are split into 3,000-word chunks.
- `answers.json`: a list of `{ "question", "reference", "keyPoints": [], "answer" }` to test grading.

Use only synthetic writing or writing whose author consented. Never put real student work through a provider marked `trainsOnInputs: true` in `src/llm/config.ts`.

Run with `npm run eval -- --provider groq` (or `gemini`, `openrouter`, `ollama`). Pin one provider per run so you can compare models. Results go to `eval/out/<timestamp>/`.
