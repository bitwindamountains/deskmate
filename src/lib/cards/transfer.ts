import type { Db } from '@/lib/llm-calls';
import { parseCards } from './csv';

const NO_DECK = { ok: false, message: "We couldn't find that deck." } as const;
const FAILED = { ok: false, message: "We couldn't import those cards. Try again." } as const;

export type ImportResult = { ok: true; added: number; skippedRows: number[]; duplicates: number } | { ok: false; message: string };

// Same card means the same front and back, ignoring case and outer spaces.
const keyOf = (front: string, back: string) => `${front.trim().toLowerCase()}\u0000${back.trim().toLowerCase()}`;

/**
 * B4.5: cards from a CSV go straight into the deck as kept (the student already chose them). Cards the deck already has,
 * or that repeat earlier in the file, are counted as duplicates, so importing the same file twice adds nothing.
 */
export async function importCards(db: Db, userId: string, deckId: string, text: string): Promise<ImportResult> {
  const { data: deck, error } = await db.from('decks').select('id').eq('id', deckId).maybeSingle();
  if (error) return FAILED;
  if (!deck) return NO_DECK;
  const parsed = parseCards(text);
  if (parsed.error) return { ok: false, message: parsed.error };
  // ponytail: reads the deck's fronts and backs once; fine for decks of a few thousand cards.
  const existing = await db.from('cards').select('front,back').eq('deck_id', deckId);
  if (existing.error) return FAILED;
  const seen = new Set(existing.data.map((c) => keyOf(c.front as string, c.back as string)));
  const fresh = parsed.cards.filter((c) => {
    const k = keyOf(c.front, c.back);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) {
    const { error: insErr } = await db.from('cards').insert(fresh.map((c) => ({ user_id: userId, deck_id: deckId, source_chunk_id: null,
      type: c.type, front: c.front, back: c.back, key_points: [], source_quote: '', concept: c.concept, bloom_level: 'remember', importance: 2, status: 'kept' })));
    if (insErr) return FAILED;
  }
  return { ok: true, added: fresh.length, skippedRows: parsed.skippedRows, duplicates: parsed.cards.length - fresh.length };
}
