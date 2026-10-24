import { isGrounded } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { resetsIn } from '@/lib/time/reset';
import { cardImprovePrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { CardImprove } from '@/llm/schemas';
import type { CardType } from '@/lib/cards/types';

export type CardImproveResult = { ok: true; suggestion: { front: string; back: string } }
  | { ok: false; status: 404 | 409 | 422 | 429 | 503; message: string };

const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that card." } as const;
const NO_SOURCE = { ok: false, status: 409, message: 'This card has no source passage to check a rewrite against. Edit it yourself instead.' } as const;
const UNGROUNDED = { ok: false, status: 422, message: "We couldn't improve this card without changing what it says. Edit it yourself instead." } as const;
const LIMIT = () => ({ ok: false, status: 429, message: `You've asked for a lot of help today. More unlocks ${resetsIn()}.` }) as const;
const BUSY = { ok: false, status: 503, message: 'Help is busy right now. Try again in a minute.' } as const;

/**
 * B2.5 "Improve this card": a rewrite under the card rules, grounded in the card's source passage. Nothing is saved here;
 * the student edits or saves it through the normal card edit. One of the day's helper calls.
 */
export async function requestCardImprove(db: Db, userId: string, cardId: string, env: Record<string, string | undefined>,
  completeFn: typeof complete = complete): Promise<CardImproveResult> {
  const { data, error } = await db.from('cards').select('type,front,back,source_chunks(text)').eq('id', cardId).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const card = data as unknown as { type: CardType; front: string; back: string; source_chunks: { text: string } | null };
  const chunk = card.source_chunks?.text;
  if (!chunk) return NO_SOURCE;

  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT();

  let r: CardImprove;
  try {
    const out = await completeFn('card_improve', cardImprovePrompt({ type: card.type, front: card.front, back: card.back, chunk }), CardImprove, { env });
    await logCalls(db, userId, out.log);
    r = out.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }
  const front = r.front.trim(), back = r.back.trim();
  // Same rule as generation: a card that can't quote its source isn't offered. Card edits cap each side at 500 characters,
  // and only a cloze card may carry {{c1::…}} (the type isn't changed here, so markup on a basic card would show raw).
  const markupOk = (card.type === 'cloze') === front.includes('{{c1::');
  if (!isGrounded(chunk, r.source_quote) || !front || !back || front.length > 500 || back.length > 500 || !markupOk) return UNGROUNDED;
  return { ok: true, suggestion: { front, back } };
}
