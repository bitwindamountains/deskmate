import type { ProviderConfig, TaskName } from './types';

// Verify current free models and data-use terms before use: both change often (Groq model last checked 2026-10-20).
// trainsOnInputs is conservative: true unless the free tier's terms say inputs are not used for training.
export const PROVIDERS: Record<string, ProviderConfig> = {
  groq: {
    id: 'groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
    trainsOnInputs: false,
    // Default (medium) spent 47-73% of output tokens on hidden reasoning; low halves output with no measured quality loss
    // (docs/superpowers/notes/2026-10-21-token-budget.md).
    reasoningEffort: 'low',
    limits: { rpm: 30, tpm: 8000 }, // free tier for this model
  },
  // Owner (2026-11-26): three hosted providers in total, Groq, Mistral and Gemini (NVIDIA NIM and OpenRouter left out: their free
  // tiers are testing-only or may train on inputs, like Gemini's). Terms checked that day, mostly from third-party summaries.
  // Mistral's free plan trains on inputs by default; false here holds only while "Anonymous improvement data" is off in
  // its Admin Console. Its free plan has no stated production allowance (guides call it prototyping).
  mistral: {
    id: 'mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-medium-latest',
    apiKeyEnv: 'MISTRAL_API_KEY',
    trainsOnInputs: false,
    limits: { rpm: 60 }, // free plan: about 1 request a second; Admin Console → Limits has the live numbers
  },
  gemini: {
    id: 'gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    trainsOnInputs: true,
    limits: { rpm: 10 }, // free tier for gemini-2.5-flash
  },
  ollama: {
    id: 'ollama',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1:8b',
    apiKeyEnv: null,
    trainsOnInputs: false,
  },
};

export const TASK_ROUTES: Record<TaskName, string[]> = {
  // Essay text is real student work: no-training providers lead; the router skips the others unless requireNoTraining is false.
  essay_global: ['groq', 'mistral', 'gemini', 'ollama'],
  essay_paragraphs: ['groq', 'mistral', 'gemini', 'ollama'],
  hint_ladder: ['groq', 'mistral', 'gemini', 'ollama'],
  hint_rewrite: ['groq', 'mistral', 'gemini', 'ollama'],
  card_generate: ['gemini', 'groq', 'mistral', 'ollama'],
  grade_answer: ['groq', 'mistral', 'gemini', 'ollama'],
  card_help: ['groq', 'mistral', 'gemini', 'ollama'],
  card_improve: ['groq', 'mistral', 'gemini', 'ollama'],
  card_rephrase: ['groq', 'mistral', 'gemini', 'ollama'],
  feynman: ['groq', 'mistral', 'gemini', 'ollama'],
  item_dialogue: ['groq', 'mistral', 'gemini', 'ollama'],
};
