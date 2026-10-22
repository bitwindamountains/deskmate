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
  },
  openrouter: {
    id: 'openrouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    trainsOnInputs: true,
  },
  gemini: {
    id: 'gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    trainsOnInputs: true,
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
  essay_global: ['groq', 'gemini', 'openrouter', 'ollama'],
  essay_paragraphs: ['groq', 'gemini', 'openrouter', 'ollama'],
  hint_ladder: ['groq', 'gemini', 'openrouter', 'ollama'],
  hint_rewrite: ['groq', 'gemini', 'openrouter', 'ollama'],
  card_generate: ['gemini', 'groq', 'openrouter', 'ollama'],
  grade_answer: ['groq', 'gemini', 'openrouter', 'ollama'],
  card_help: ['groq', 'gemini', 'openrouter', 'ollama'],
  item_dialogue: ['groq', 'gemini', 'openrouter', 'ollama'],
};
