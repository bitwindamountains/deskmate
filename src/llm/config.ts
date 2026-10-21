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
  },
  // Groq rate-limits per model, so a second model roughly doubles essay capacity on the free tier (eval note 2026-10-21).
  // Same provider and terms as above; its essay quality has not been rated yet.
  'groq-small': {
    id: 'groq-small',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-20b',
    apiKeyEnv: 'GROQ_API_KEY',
    trainsOnInputs: false,
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
  essay_global: ['groq', 'groq-small', 'gemini', 'openrouter', 'ollama'],
  essay_paragraphs: ['groq', 'groq-small', 'gemini', 'openrouter', 'ollama'],
  hint_ladder: ['groq', 'groq-small', 'gemini', 'openrouter', 'ollama'],
  hint_rewrite: ['groq', 'groq-small', 'gemini', 'openrouter', 'ollama'],
  card_generate: ['gemini', 'groq', 'openrouter', 'ollama'],
  grade_answer: ['groq', 'gemini', 'openrouter', 'ollama'],
};
