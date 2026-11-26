export type TaskName = 'essay_global' | 'essay_paragraphs' | 'hint_ladder' | 'hint_rewrite' | 'card_generate' | 'grade_answer' | 'card_help' | 'item_dialogue' | 'card_improve' | 'card_rephrase' | 'feynman';

export interface ProviderConfig {
  id: string;
  kind: 'openai' | 'gemini';
  /** For kind 'openai': up to and including '/v1'. */
  baseUrl: string;
  model: string;
  /** null = no key needed (e.g. local Ollama). */
  apiKeyEnv: string | null;
  /** From the provider's current terms: may inputs be used for training? */
  trainsOnInputs: boolean;
  /** Reasoning models only (e.g. gpt-oss on Groq): hidden reasoning tokens count against free-tier token limits. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** The free tier's per-minute limits, kept locally by ProviderLimiter (tpm: input plus output tokens). */
  limits?: { rpm: number; tpm?: number };
}

export interface ChatRequest {
  system: string;
  user: string;
  temperature: number;
  timeoutMs: number;
}

export type ProviderOutcome =
  | { ok: true; text: string; tokensIn: number; tokensOut: number }
  | { ok: false; status: number | 'timeout' | 'network'; message: string; retryAfterMs?: number };

export type CallStatus =
  | 'ok'
  | 'schema_invalid'
  | 'rate_limited'
  | 'error'
  | 'timeout'
  | 'skipped_no_key'
  | 'skipped_privacy';

export interface CallLog {
  task: TaskName;
  provider: string;
  model: string;
  status: CallStatus;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  message?: string;
}
