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
  essay_global: ['gemini', 'groq', 'openrouter', 'ollama'],
  essay_paragraphs: ['gemini', 'groq', 'openrouter', 'ollama'],
  card_generate: ['gemini', 'groq', 'openrouter', 'ollama'],
  grade_answer: ['groq', 'gemini', 'openrouter', 'ollama'],
};
