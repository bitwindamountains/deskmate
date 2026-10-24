import { isGrounded } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { cardGeneratePrompt, type CardDensity, type CardType, type DiscardReason } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { CardGenerate } from '@/llm/schemas';
import { resetsIn } from '@/lib/time/reset';
import { DAILY_GENERATIONS } from './limits';

export type CardRow = { id: string; deck_id: string; source_chunk_id: string | null; type: 'basic' | 'cloze' | 'why'; front: string;
  back: string; key_points: string[]; source_quote: string; concept: string; bloom_level: string; importance: 1 | 2 | 3;
  status: 'pending' | 'kept' | 'discarded'; page_start: number | null };
export type GenerateResult =
  | { ok: true; cards: CardRow[]; droppedUngrounded: number; alreadyGenerated: boolean }
  | { ok: false; status: 404 | 429 | 503; error: 'not_found' | 'quota' | 'busy'; message: string };

const CARD_COLS = 'id,deck_id,source_chunk_id,type,front,back,key_points,source_quote,concept,bloom_level,importance,status';
const NOT_FOUND = { ok: false, status: 404, error: 'not_found', message: "We couldn't find that part of your material." } as const;
const QUOTA = () => ({ ok: false, status: 429, error: 'quota', message: `You've used today's ${DAILY_GENERATIONS} card generations. They reset ${resetsIn()}.` }) as const;
const BUSY = { ok: false, status: 503, error: 'busy', message: 'The AI service is busy. Your material is saved; try again in a few minutes.' } as const;

type ChunkRow = { id: string; text: string; page_start: number | null; generated_at: string | null;
  sources: { deck_id: string; card_density?: CardDensity; card_types?: CardType[]; decks: { subject: string | null } | null } };

/** The reason the student gives for most of their recent discards, when there are enough to call it a pattern. */
async function discardPattern(db: Db): Promise<DiscardReason | undefined> {
  const { data } = await db.from('cards').select('discard_reason').eq('status', 'discarded').in('discard_reason', ['trivial', 'wrong', 'unclear'])
    .order('created_at', { ascending: false }).limit(100);
  const reasons = ((data ?? []) as { discard_reason: DiscardReason | null }[]).flatMap((r) => (r.discard_reason ? [r.discard_reason] : []));
  if (reasons.length < 5) return undefined;
  const counts = new Map<DiscardReason, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n / reasons.length >= 0.5 ? top : undefined;
}

/**
 * Ordering: cards are inserted before generated_at is set. A crash in between leaves cards with generated_at null;
 * the next call sees those cards, sets generated_at and returns them, so nothing is lost and quota is never charged twice
 * (the quota function is also idempotent per source).
 */
export async function generateChunk(db: Db, userId: string, sourceId: string, position: number,
  env: Record<string, string | undefined>, completeFn: typeof complete = complete): Promise<GenerateResult> {
  const { data, error } = await db.from('source_chunks')
    .select('id,text,page_start,generated_at,sources(deck_id,card_density,card_types,decks(subject))')
    .eq('source_id', sourceId).eq('position', position).maybeSingle();
  if (error) return BUSY;
  if (!data) return NOT_FOUND;
  const chunk = data as unknown as ChunkRow;
  const withPage = (rows: unknown[]) => rows.map((r) => ({ ...(r as CardRow), page_start: chunk.page_start }));
  const markGenerated = () => db.from('source_chunks').update({ generated_at: new Date().toISOString() }).eq('id', chunk.id);

  const { data: existing, error: existingErr } = await db.from('cards').select(CARD_COLS).eq('source_chunk_id', chunk.id).order('created_at');
  if (existingErr) return BUSY;
  if (chunk.generated_at || existing?.length) {
    if (!chunk.generated_at) {
      const { error: markErr } = await markGenerated();
      if (markErr) return BUSY;
    }
    return { ok: true, cards: withPage(existing ?? []), droppedUngrounded: 0, alreadyGenerated: true };
  }

  const { data: allowed, error: quotaErr } = await db.rpc('consume_generation_quota', { p_source_id: sourceId });
  if (quotaErr) return quotaErr.code === '42501' ? NOT_FOUND : BUSY;
  if (!allowed) return QUOTA();

  let generated: CardGenerate;
  try {
    const subject = chunk.sources?.decks?.subject ?? 'general';
    const prompt = cardGeneratePrompt({ chunk: chunk.text, subject, level: 'college', density: chunk.sources?.card_density,
      avoid: await discardPattern(db), types: chunk.sources?.card_types });
    const r = await completeFn('card_generate', prompt, CardGenerate, { env });
    await logCalls(db, userId, r.log);
    generated = r.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  // B-S2: a card of a type the student left out is dropped even if the model made it anyway.
  const types = chunk.sources?.card_types;
  const kept = generated.cards.filter((c) => isGrounded(chunk.text, c.source_quote) && (!types || types.includes(c.type)));
  let inserted: unknown[] = [];
  if (kept.length) {
    const { data: rows, error: insErr } = await db.from('cards')
      .insert(kept.map((c) => ({ ...c, user_id: userId, deck_id: chunk.sources.deck_id, source_chunk_id: chunk.id, status: 'pending' })))
      .select(CARD_COLS);
    if (insErr || !rows) return BUSY; // quota already paid for this source, so a retry is free
    inserted = rows;
  }
  const { error: markErr } = await markGenerated();
  if (markErr) return BUSY;
  return { ok: true, cards: withPage(inserted), droppedUngrounded: generated.cards.length - kept.length, alreadyGenerated: false };
}
