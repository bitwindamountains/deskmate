import { logCalls, type Db } from '@/lib/llm-calls';
import { gradeAnswerPrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { GradeAnswer } from '@/llm/schemas';
import { normalizeAnswer } from '@/review/grade';

export type GradeResult = { ok: true; result: GradeAnswer; cached: boolean } | { ok: false; status: 404 | 503 };

export async function answerHash(cardId: string, answer: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${cardId}\n${normalizeAnswer(answer)}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ponytail: no per-user grade limit (reviews are unlimited, spec §6.5); add one if llm_calls shows abuse.
export async function gradeWithLlm(db: Db, userId: string, cardId: string, answer: string,
  env: Record<string, string | undefined>, completeFn: typeof complete = complete): Promise<GradeResult> {
  const { data: card, error } = await db.from('cards').select('front,back,key_points').eq('id', cardId).maybeSingle();
  if (error) return { ok: false, status: 503 };
  if (!card) return { ok: false, status: 404 };

  const hash = await answerHash(cardId, answer);
  const { data: hit } = await db.from('grade_cache').select('result').eq('card_id', cardId).eq('answer_hash', hash).maybeSingle();
  const cached = GradeAnswer.safeParse(hit?.result);
  if (cached.success) return { ok: true, result: cached.data, cached: true };

  let result: GradeAnswer;
  try {
    const r = await completeFn('grade_answer',
      gradeAnswerPrompt({ question: card.front, reference: card.back, keyPoints: card.key_points ?? [], answer }), GradeAnswer, { env });
    await logCalls(db, userId, r.log);
    result = r.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return { ok: false, status: 503 };
  }

  // A concurrent identical grade may have written the row first; either result is fine, so a failed write is ignored.
  await db.from('grade_cache').upsert({ card_id: cardId, answer_hash: hash, user_id: userId, result },
    { onConflict: 'card_id,answer_hash', ignoreDuplicates: true });
  return { ok: true, result, cached: false };
}
