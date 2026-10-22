import type { EditorCard } from '@/app/(app)/study/deck/[deckId]/card-list';
import type { Db } from '@/lib/llm-calls';
import { allRows } from './transfer';

type Row = Omit<EditorCard, 'lapses' | 'sourceId'> & { card_states: { lapses: number } | { lapses: number }[] | null;
  source_chunks: { source_id: string } | null };

/** Every card the deck editor lists (pending, kept, suspended), paged past the API's 1,000-row cap. */
export async function loadDeckCards(db: Db, deckId: string): Promise<EditorCard[]> {
  const rows = await allRows<Row>((from, to) => db.from('cards')
    .select('id,type,front,back,concept,status,card_states(lapses),source_chunks(source_id)')
    .eq('deck_id', deckId).in('status', ['pending', 'kept', 'suspended']).order('created_at').order('id').range(from, to)
    .then((r) => ({ data: r.data as unknown as Row[] | null, error: r.error })));
  if (!rows) throw new Error("We couldn't load your cards.");
  return rows.map(({ card_states, source_chunks, ...c }): EditorCard => {
    const s = Array.isArray(card_states) ? card_states[0] : card_states;
    return { ...c, lapses: s?.lapses ?? 0, sourceId: source_chunks?.source_id ?? null };
  });
}
