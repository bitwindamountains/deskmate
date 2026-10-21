import type { SupabaseClient } from '@supabase/supabase-js';
import type { StateRow, StudyCard } from '@/review/schedule';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
type Db = SupabaseClient<any, any, any>;
/** sourceQuote is optional so fixtures can omit it; loadStudy always fills it. */
export type ReviewCard = StudyCard & { front: string; back: string; keyPoints: string[]; sourceQuote?: string };
export type Deck = { id: string; title: string; exam_date: string | null };
type Row = { id: string; deck_id: string; type: ReviewCard['type']; importance: ReviewCard['importance']; front: string; back: string;
  key_points: string[] | null; source_quote: string; card_states: StateRow | StateRow[] | null };

const LOAD_FAILED = "We couldn't load your cards.";
const iso = (t: string) => new Date(t).toISOString(); // the client compares timestamps as strings against its own toISOString()

/** The user's decks, kept cards with their FSRS state, and how many new cards they started today. RLS scopes every query. */
export async function loadStudy(db: Db, deckId?: string): Promise<{ decks: Deck[]; cards: ReviewCard[]; newIntroducedToday: number }> {
  // ponytail: "today" is the UTC day on the server; move to the user's time zone when profiles store one.
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  let cardQuery = db.from('cards').select('id,deck_id,type,importance,front,back,key_points,source_quote,card_states(*)').eq('status', 'kept');
  let deckQuery = db.from('decks').select('id,title,exam_date').order('created_at');
  if (deckId) { cardQuery = cardQuery.eq('deck_id', deckId); deckQuery = deckQuery.eq('id', deckId); }

  // ponytail: loads every kept card; page or filter by due date once decks grow past a few thousand cards.
  const [cards, decks, todays] = await Promise.all([cardQuery, deckQuery, db.from('reviews').select('card_id').gte('reviewed_at', today)]);
  if (cards.error || decks.error || todays.error) throw new Error(LOAD_FAILED);

  // A card is new today when its first review is today.
  const reviewedToday = [...new Set(todays.data.map((r) => r.card_id as string))];
  let newIntroducedToday = 0;
  if (reviewedToday.length) {
    const before = await db.from('reviews').select('card_id').in('card_id', reviewedToday).lt('reviewed_at', today);
    if (before.error) throw new Error(LOAD_FAILED);
    newIntroducedToday = reviewedToday.length - new Set(before.data.map((r) => r.card_id as string)).size;
  }

  const studyCards = (cards.data as unknown as Row[]).map((r): ReviewCard => {
    const s = Array.isArray(r.card_states) ? r.card_states[0] ?? null : r.card_states;
    const state: StateRow | null = s && {
      card_id: s.card_id, due: iso(s.due), stability: s.stability, difficulty: s.difficulty, scheduled_days: s.scheduled_days,
      learning_steps: s.learning_steps, reps: s.reps, lapses: s.lapses, state: s.state, last_review: s.last_review ? iso(s.last_review) : null,
    };
    return { id: r.id, deckId: r.deck_id, type: r.type, importance: r.importance, front: r.front, back: r.back, keyPoints: r.key_points ?? [],
      sourceQuote: r.source_quote, state };
  });
  return { decks: decks.data as Deck[], cards: studyCards, newIntroducedToday };
}
