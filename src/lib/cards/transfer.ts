import { z } from 'zod';
import type { Db } from '@/lib/llm-calls';
import { type CsvCard, parseCards } from './csv';
import { CARD_TYPES } from '@/lib/cards/types';
import { allRows } from './all-rows';

export { allRows };

const NO_DECK = { ok: false, message: "We couldn't find that deck." } as const;
const FAILED = { ok: false, message: "We couldn't import those cards. Try again." } as const;

/** inDeck: cards the deck already has; inFile: rows that repeat an earlier row of the same file. */
export type ImportResult = { ok: true; added: number; skippedRows: number[]; inDeck: number; inFile: number } | { ok: false; message: string };

// Same card means the same front and back, ignoring case and outer spaces.
const keyOf = (front: string, back: string) => `${front.trim().toLowerCase()}\u0000${back.trim().toLowerCase()}`;

/**
 * B4.5: cards from a CSV go straight into the deck as kept (the student already chose them). Cards the deck already has,
 * or that repeat earlier in the file, are counted as duplicates, so importing the same file twice adds nothing.
 */
export async function importCards(db: Db, userId: string, deckId: string, text: string): Promise<ImportResult> {
  const parsed = parseCards(text);
  if (parsed.error) return { ok: false, message: parsed.error };
  return insertCards(db, userId, deckId, parsed.cards, parsed.skippedRows);
}

const Side = z.string().trim().min(1).max(500);
const AnkiCards = z.array(z.object({ front: Side, back: Side, concept: z.string().trim().max(120), type: z.enum(CARD_TYPES) }))
  .min(1).max(2000);

/** Cards an .apkg file gave on the device (see apkg.ts). They come from the client, so they are checked again here. */
export async function importAnkiCards(db: Db, userId: string, deckId: string, input: unknown): Promise<ImportResult> {
  const v = AnkiCards.safeParse(input);
  if (!v.success) return { ok: false, message: "We couldn't import that file." };
  return insertCards(db, userId, deckId, v.data, []);
}

export async function insertCards(db: Db, userId: string, deckId: string, cards: CsvCard[], skippedRows: number[]): Promise<ImportResult> {
  const { data: deck, error } = await db.from('decks').select('id').eq('id', deckId).maybeSingle();
  if (error) return FAILED;
  if (!deck) return NO_DECK;
  const existing = await allRows<{ front: string; back: string }>((from, to) =>
    // A card thrown away in triage doesn't count: importing it is the student choosing it again.
    db.from('cards').select('front,back').eq('deck_id', deckId).neq('status', 'discarded').order('created_at').order('id').range(from, to));
  if (!existing) return FAILED;
  const deckKeys = new Set(existing.map((c) => keyOf(c.front, c.back)));
  const fileKeys = new Set<string>();
  let inDeck = 0, inFile = 0;
  const fresh = cards.filter((c) => {
    const k = keyOf(c.front, c.back);
    if (deckKeys.has(k)) { inDeck++; return false; }
    if (fileKeys.has(k)) { inFile++; return false; }
    fileKeys.add(k);
    return true;
  });
  if (fresh.length) {
    const { error: insErr } = await db.from('cards').insert(fresh.map((c) => ({ user_id: userId, deck_id: deckId, source_chunk_id: null,
      type: c.type, front: c.front, back: c.back, key_points: [], source_quote: '', concept: c.concept, bloom_level: 'remember', importance: 2, status: 'kept' })));
    if (insErr) return FAILED;
  }
  return { ok: true, added: fresh.length, skippedRows, inDeck, inFile };
}
