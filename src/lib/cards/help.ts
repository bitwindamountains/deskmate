import { isGrounded } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { cardHelpPrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { CardHelp } from '@/llm/schemas';

type Help = { explanation: string; mnemonic: string; analogy: string };
export type CardHelpResult = { ok: true; help: Help; added: number; dropped: number; cached: boolean }
  | { ok: false; status: 404 | 429 | 503; message: string };

type CardRow = { id: string; deck_id: string; source_chunk_id: string | null; front: string; back: string; key_points: string[] | null;
  importance: number; source_chunks: { text: string } | null };

const NOT_FOUND = { ok: false, status: 404, message: "We couldn't find that card." } as const;
const LIMIT = { ok: false, status: 429, message: "You've asked for a lot of help today. More unlocks at midnight UTC." } as const;
const BUSY = { ok: false, status: 503, message: 'Help is busy right now. Try again in a minute.' } as const;

/** On-demand help for a card (B3.3 leeches, B3.8 mnemonics). Cached per card; one call takes one of the day's helper calls. */
export async function requestCardHelp(db: Db, userId: string, cardId: string, env: Record<string, string | undefined>,
  completeFn: typeof complete = complete): Promise<CardHelpResult> {
  const { data, error } = await db.from('cards')
    .select('id,deck_id,source_chunk_id,front,back,key_points,importance,source_chunks(text)').eq('id', cardId).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const card = data as unknown as CardRow;

  const { data: aid, error: aidErr } = await db.from('card_aids').select('result').eq('card_id', cardId).maybeSingle();
  if (aidErr) return BUSY;
  if (aid) return { ok: true, help: aid.result as Help, added: 0, dropped: 0, cached: true };

  // Same daily budget as essay hints: every on-demand LLM helper call counts once, before the call.
  const { data: allowed, error: qErr } = await db.rpc('consume_hint_quota');
  if (qErr) return BUSY;
  if (!allowed) return LIMIT;

  const chunk = card.source_chunks?.text ?? '';
  let help: CardHelp;
  try {
    const r = await completeFn('card_help', cardHelpPrompt({ front: card.front, back: card.back, keyPoints: card.key_points ?? [], chunk }), CardHelp, { env });
    await logCalls(db, userId, r.log);
    help = r.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  // Grounding (brief B2.2): a split card whose quote is not in the source is dropped, never saved.
  const grounded = chunk ? help.split.filter((s) => isGrounded(chunk, s.source_quote)) : [];
  if (grounded.length) {
    const { error: insErr } = await db.from('cards').insert(grounded.map((s) => ({ ...s, user_id: userId, deck_id: card.deck_id,
      source_chunk_id: card.source_chunk_id, importance: card.importance, status: 'pending' })));
    if (insErr) return BUSY;
  }
  const result: Help = { explanation: help.explanation, mnemonic: help.mnemonic, analogy: help.analogy };
  await db.from('card_aids').insert({ card_id: cardId, user_id: userId, result }); // best effort: a lost cache row costs one more call later
  return { ok: true, help: result, added: grounded.length, dropped: help.split.length - grounded.length, cached: false };
}
