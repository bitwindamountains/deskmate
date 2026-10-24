import { normalizeText } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { resetsIn } from '@/lib/time/reset';
import { cardRephrasePrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { CardRephrase } from '@/llm/schemas';
import type { CardType } from './types';

export type RephraseResult = { ok: true; question: string; cached: boolean }
  | { ok: false; status: 404 | 422 | 429 | 503; message: string };

const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that card." } as const;
const UNUSABLE = { ok: false, status: 422, message: "We couldn't find a fair way to reword this one. Try the card as it is." } as const;
const LIMIT = () => ({ ok: false, status: 429, message: `You've asked for a lot of help today. More unlocks ${resetsIn()}.` }) as const;
const BUSY = { ok: false, status: 503, message: 'Help is busy right now. Try again in a minute.' } as const;

const norm = (s: string) => normalizeText(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

/**
 * B3.1 "Ask it another way": a rewording of the card's question with the same answer, so the student recalls the idea,
 * not the wording. Made once per card on request (one of the day's helper calls) and saved in `cards.variants`.
 */
export async function requestRephrase(db: Db, userId: string, cardId: string, env: Record<string, string | undefined>,
  completeFn: typeof complete = complete): Promise<RephraseResult> {
  const { data, error } = await db.from('cards').select('type,front,back,variants').eq('id', cardId).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const card = data as { type: CardType; front: string; back: string; variants: string[] };
  if (card.variants.length) return { ok: true, question: card.variants[0], cached: true };

  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT();

  let question: string;
  try {
    const r = await completeFn('card_rephrase', cardRephrasePrompt({ type: card.type, front: card.front, back: card.back }), CardRephrase, { env });
    await logCalls(db, userId, r.log);
    question = r.data.question.trim();
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }
  // Not the same question again, no cloze markup, and no giving away a short answer.
  const back = norm(card.back);
  const leaks = back.length > 0 && back.split(' ').length <= 6 && norm(question).includes(back);
  if (!question || question.length > 500 || question.includes('{{') || norm(question) === norm(card.front) || leaks) return UNUSABLE;
  const { error: saveErr } = await db.from('cards').update({ variants: [question] }).eq('id', cardId).eq('user_id', userId);
  if (saveErr) return BUSY;
  return { ok: true, question, cached: false };
}
