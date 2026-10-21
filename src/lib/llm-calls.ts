import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallLog } from '@/llm/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export type Db = SupabaseClient<any, any, any>;

/** Best effort: a failed log write must never fail the request. */
export async function logCalls(db: Db, userId: string, log: CallLog[]) {
  if (!log.length) return;
  try {
    const { error } = await db.from('llm_calls').insert(log.map((l) => ({
      user_id: userId, task: l.task, provider: l.provider, model: l.model, status: l.status,
      tokens_in: l.tokensIn, tokens_out: l.tokensOut, latency_ms: l.latencyMs,
    })));
    if (error) console.error('llm_calls insert failed', error.code);
  } catch {
    console.error('llm_calls insert failed');
  }
}
