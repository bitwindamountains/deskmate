import type { Db } from '@/lib/llm-calls';
import { parseCards } from './csv';

const NO_DECK = { ok: false, message: "We couldn't find that deck." } as const;
const FAILED = { ok: false, message: "We couldn't import those cards. Try again." } as const;

/** B4.5: cards from a CSV go straight into the deck as kept (they were already chosen by the student). */
export async function importCards(db: Db, userId: string, deckId: string, text: string):
  Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
  const { data: deck, error } = await db.from('decks').select('id').eq('id', deckId).maybeSingle();
  if (error) return FAILED;
  if (!deck) return NO_DECK;
  const parsed = parseCards(text);
  if (parsed.error) return { ok: false, message: parsed.error };
  if (parsed.cards.length) {
    const { error: insErr } = await db.from('cards').insert(parsed.cards.map((c) => ({ user_id: userId, deck_id: deckId, source_chunk_id: null,
      type: c.type, front: c.front, back: c.back, key_points: [], source_quote: '', concept: c.concept, bloom_level: 'remember', importance: 2, status: 'kept' })));
    if (insErr) return FAILED;
  }
  return { ok: true, added: parsed.cards.length, skipped: parsed.skipped };
}
