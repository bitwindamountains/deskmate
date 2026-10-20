import type { ZodType } from 'zod';
import { PROVIDERS, TASK_ROUTES } from './config';
import { extractJson } from './json';
import { callGemini } from './providers/gemini';
import { callOpenAICompatible } from './providers/openai-compatible';
import type { CallLog, CallStatus, ProviderConfig, TaskName } from './types';

export interface CompleteOptions {
  /** Exclude providers whose free tier may train on inputs. Defaults to true; pass false only for synthetic data. Required for real student content. */
  requireNoTraining?: boolean;
  /** Where API keys are read from (src/ has no access to process.env). */
  env: Record<string, string | undefined>;
  /** Overrides TASK_ROUTES order, e.g. to pin one provider. */
  providers?: ProviderConfig[];
  timeoutMs?: number;
}

export interface CompleteResult<T> {
  data: T;
  provider: string;
  model: string;
  log: CallLog[];
}

export class AllProvidersFailedError extends Error {
  constructor(
    message: string,
    public log: CallLog[],
  ) {
    super(message);
    this.name = 'AllProvidersFailedError';
  }
}

const ADAPTERS = { openai: callOpenAICompatible, gemini: callGemini };
const ATTEMPTS_PER_PROVIDER = 2; // one retry on schema-invalid output

export async function complete<T>(
  task: TaskName,
  prompt: { system: string; user: string },
  schema: ZodType<T>,
  opts: CompleteOptions,
): Promise<CompleteResult<T>> {
  const providers = opts.providers ?? TASK_ROUTES[task].map((id) => PROVIDERS[id]);
  const log: CallLog[] = [];
  const entry = (p: ProviderConfig, status: CallStatus, extra: Partial<CallLog> = {}): CallLog => ({
    task,
    provider: p.id,
    model: p.model,
    status,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    ...extra,
  });

  for (const p of providers) {
    if ((opts.requireNoTraining ?? true) && p.trainsOnInputs) {
      log.push(entry(p, 'skipped_privacy'));
      continue;
    }
    const apiKey = p.apiKeyEnv ? opts.env[p.apiKeyEnv] : null;
    if (p.apiKeyEnv && !apiKey) {
      log.push(entry(p, 'skipped_no_key', { message: `${p.apiKeyEnv} not set` }));
      continue;
    }
    for (let attempt = 0; attempt < ATTEMPTS_PER_PROVIDER; attempt++) {
      const started = Date.now();
      const out = await ADAPTERS[p.kind](p, apiKey ?? null, {
        ...prompt,
        temperature: 0,
        timeoutMs: opts.timeoutMs ?? 30_000,
      });
      const latencyMs = Date.now() - started;
      if (!out.ok) {
        const status: CallStatus = out.status === 429 ? 'rate_limited' : out.status === 'timeout' ? 'timeout' : 'error';
        log.push(entry(p, status, { latencyMs, message: `${out.status}: ${out.message}` }));
        break; // provider failure: move to the next provider
      }
      const usage = { tokensIn: out.tokensIn, tokensOut: out.tokensOut, latencyMs };
      let parsed: ReturnType<typeof schema.safeParse>;
      try {
        parsed = schema.safeParse(extractJson(out.text));
      } catch (e) {
        log.push(entry(p, 'schema_invalid', { ...usage, message: String(e) }));
        continue;
      }
      if (!parsed.success) {
        log.push(entry(p, 'schema_invalid', { ...usage, message: parsed.error.message.slice(0, 300) }));
        continue;
      }
      log.push(entry(p, 'ok', usage));
      return { data: parsed.data, provider: p.id, model: p.model, log };
    }
  }

  const missing = log.filter((l) => l.status === 'skipped_no_key');
  const message =
    missing.length === providers.length
      ? `No usable provider for ${task}: set one of ${providers.map((p) => p.apiKeyEnv).join(', ')}`
      : `All providers failed for ${task}: ${log.map((l) => `${l.provider}: ${l.status}${l.message ? ` (${l.message.slice(0, 120)})` : ''}`).join('; ')}`;
  throw new AllProvidersFailedError(message, log);
}
