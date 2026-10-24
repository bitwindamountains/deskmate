import { isGrounded } from '@/grounding';
import { logCalls, type Db } from '@/lib/llm-calls';
import { cardGeneratePrompt } from '@/llm/prompts';
import { AllProvidersFailedError, complete } from '@/llm/router';
import { CardGenerate } from '@/llm/schemas';
import { resetsIn } from '@/lib/time/reset';

export type CardRow = { id: string; deck_id: string; source_chunk_id: string | null; type: 'basic' | 'cloze' | 'why'; front: string;
  back: string; key_points: string[]; source_quote: string; concept: string; bloom_level: string; importance: 1 | 2 | 3;
  status: 'pending' | 'kept' | 'discarded'; page_start: number | null };
export type GenerateResult =
  | { ok: true; cards: CardRow[]; droppedUngrounded: number; alreadyGenerated: boolean }
  | { ok: false; status: 404 | 429 | 503; error: 'not_found' | 'quota' | 'busy'; message: string };

const CARD_COLS = 'id,deck_id,source_chunk_id,type,front,back,key_points,source_quote,concept,bloom_level,importance,status';
const NOT_FOUND = { ok: false, status: 404, error: 'not_found', message: "We couldn't find that part of your material." } as const;
const QUOTA = () => ({ ok: false, status: 429, error: 'quota', message: `You've used today's 3 card generations. They reset ${resetsIn()}.` }) as const;
const BUSY = { ok: false, status: 503, error: 'busy', message: 'The AI service is busy. Your material is saved; try again in a few minutes.' } as const;

type ChunkRow = { id: string; text: string; page_start: number | null; generated_at: string | null; sources: { deck_id: string; decks: { subject: string | null } | null } };

/**
 * Ordering: cards are inserted before generated_at is set. A crash in between leaves cards with generated_at null;
 * the next call sees those cards, sets generated_at and returns them, so nothing is lost and quota is never charged twice
 * (the quota function is also idempotent per source).
 */
export async function generateChunk(db: Db, userId: string, sourceId: string, position: number,
  env: Record<string, string | undefined>, completeFn: typeof complete = complete): Promise<GenerateResult> {
  const { data, error } = await db.from('source_chunks')
    .select('id,text,page_start,generated_at,sources(deck_id,decks(subject))')
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
    const r = await completeFn('card_generate', cardGeneratePrompt({ chunk: chunk.text, subject, level: 'college' }), CardGenerate, { env });
    await logCalls(db, userId, r.log);
    generated = r.data;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) await logCalls(db, userId, e.log);
    return BUSY;
  }

  const kept = generated.cards.filter((c) => isGrounded(chunk.text, c.source_quote));
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
