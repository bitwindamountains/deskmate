export type TaskName = 'essay_global' | 'essay_paragraphs' | 'hint_ladder' | 'hint_rewrite' | 'card_generate' | 'grade_answer';

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
}

export interface ChatRequest {
  system: string;
  user: string;
  temperature: number;
  timeoutMs: number;
}

export type ProviderOutcome =
  | { ok: true; text: string; tokensIn: number; tokensOut: number }
  | { ok: false; status: number | 'timeout' | 'network'; message: string };

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
