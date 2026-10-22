import { startOfLocalDay } from '@/lib/time/zone';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StateRow, StudyCard } from '@/review/schedule';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
type Db = SupabaseClient<any, any, any>;
/** sourceQuote is optional so fixtures can omit it; loadStudy always fills it. */
export type ReviewCard = StudyCard & { front: string; back: string; keyPoints: string[]; concept: string; sourceQuote?: string;
  /** Practice cards from the template bank have no notes: their quote is an example sentence, not a source. */
  quoteIsExample?: boolean };
export type Deck = { id: string; title: string; exam_date: string | null };
type Row = { id: string; deck_id: string; type: ReviewCard['type']; importance: ReviewCard['importance']; front: string; back: string;
  key_points: string[] | null; concept: string; source_quote: string; source_chunk_id: string | null; goal_match: boolean; card_states: StateRow | StateRow[] | null };

const LOAD_FAILED = "We couldn't load your cards.";
const iso = (t: string) => new Date(t).toISOString(); // the client compares timestamps as strings against its own toISOString()

/** The user's decks, kept cards with their FSRS state, and how many new cards they started today. RLS scopes every query. */
export async function loadStudy(db: Db, deckId?: string, zone = 'UTC'): Promise<{ decks: Deck[]; cards: ReviewCard[]; newIntroducedToday: number }> {
  // "Today" starts at the student's local midnight (zone comes from their browser), not the server's UTC midnight.
  const today = startOfLocalDay(new Date(), zone).toISOString();
  let cardQuery = db.from('cards').select('id,deck_id,type,importance,front,back,key_points,concept,source_quote,source_chunk_id,goal_match,card_states(*)').eq('status', 'kept');
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
      concept: r.concept, sourceQuote: r.source_quote, quoteIsExample: r.source_chunk_id === null, goalMatch: r.goal_match, state };
  });
  return { decks: decks.data as Deck[], cards: studyCards, newIntroducedToday };
}

export type DeckSummary = { id: string; title: string; exam_date: string | null; kept: number; due: number; fresh: number;
  /** kept cards with lapses >= 4 */
  leeches: number;
  /** sources in this deck with cards still waiting for keep/discard */
  triage: { sourceId: string; title: string; pending: number }[] };
type SummaryRow = { deck_id: string; status: 'pending' | 'kept'; card_states: { due: string; lapses: number } | { due: string; lapses: number }[] | null;
  source_chunks: { source_id: string } | null };

/** The Study page's per-deck counts. Suspended and discarded cards are not counted. RLS scopes every query. */
export async function loadDeckSummaries(db: Db): Promise<DeckSummary[]> {
  // ponytail: counts every card client-side; switch to a counting view if decks grow past a few thousand cards.
  const [decks, cards, sources] = await Promise.all([
    db.from('decks').select('id,title,exam_date').order('created_at'),
    db.from('cards').select('deck_id,status,card_states(due,lapses),source_chunks(source_id)').in('status', ['pending', 'kept']),
    db.from('sources').select('id,title'),
  ]);
  if (decks.error || cards.error || sources.error) throw new Error("We couldn't load your decks.");

  const now = Date.now();
  const sourceTitle = new Map(sources.data.map((s) => [s.id as string, s.title as string]));
  const summaries: DeckSummary[] = decks.data.map((d) => ({ id: d.id, title: d.title, exam_date: d.exam_date, kept: 0, due: 0, fresh: 0, leeches: 0, triage: [] }));
  const byId = new Map(summaries.map((s) => [s.id, s]));
  for (const c of cards.data as unknown as SummaryRow[]) {
    const deck = byId.get(c.deck_id);
    if (!deck) continue;
    if (c.status === 'pending') {
      const sourceId = c.source_chunks?.source_id;
      if (!sourceId) continue;
      const t = deck.triage.find((x) => x.sourceId === sourceId);
      if (t) t.pending++;
      else deck.triage.push({ sourceId, title: sourceTitle.get(sourceId) ?? 'your material', pending: 1 });
      continue;
    }
    deck.kept++;
    const s = Array.isArray(c.card_states) ? c.card_states[0] : c.card_states;
    if (!s) deck.fresh++;
    else {
      if (new Date(s.due).getTime() <= now) deck.due++;
      if (s.lapses >= 4) deck.leeches++;
    }
  }
  return summaries;
}
