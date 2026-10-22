import type { PatternKey } from '@/growth/patterns';
import { TEMPLATES } from '@/growth/templates';
import type { Db } from '@/lib/llm-calls';

export type PracticeResult = { ok: true; deckId: string; added: number } | { ok: false; message: string };

export const PRACTICE_SUBJECT = 'writing-practice';
const FAILED = { ok: false, message: "We couldn't add those cards. Try again." } as const;

/** Essay → cards (C1): a pattern's hand-written cards go into the student's one "Writing practice" deck, once. */
export async function addPractice(db: Db, userId: string, pattern: PatternKey): Promise<PracticeResult> {
  const cards = TEMPLATES[pattern];
  if (!cards) return FAILED;
  const found = await db.from('decks').select('id').eq('subject', PRACTICE_SUBJECT).order('created_at').limit(1).maybeSingle();
  if (found.error) return FAILED;
  let deckId = found.data?.id as string | undefined;
  if (!deckId) {
    const made = await db.from('decks').insert({ user_id: userId, title: 'Writing practice', subject: PRACTICE_SUBJECT }).select('id').single();
    if (made.error) return FAILED;
    deckId = made.data.id as string;
  }
  // ponytail: two clicks racing can both pass this check; the cost is a duplicate set the student can delete in the deck editor.
  const have = await db.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId).eq('concept', pattern);
  if (have.error) return FAILED;
  if (have.count) return { ok: true, deckId, added: 0 };
  const { error } = await db.from('cards').insert(cards.map((c) => ({ user_id: userId, deck_id: deckId, source_chunk_id: null, type: c.type,
    front: c.front, back: c.back, key_points: c.key_points, source_quote: c.example, concept: pattern, bloom_level: 'apply', importance: 2, status: 'kept' })));
  if (error) return FAILED;
  return { ok: true, deckId, added: cards.length };
}
