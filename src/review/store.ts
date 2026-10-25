import Dexie, { type EntityTable } from 'dexie';
import type { Confidence } from './calibration';
import type { Grade, StateRow, StudyCard } from './schedule';

/** Mirrors the scholar.reviews row (Task 1). */
export type ReviewPayload = { client_review_id: string; card_id: string; answer_text: string | null;
  grade_source: 'exact' | 'fuzzy' | 'embedding' | 'llm' | 'self' | 'choice' | 'blank' | 'reverse'; ai_score: number | null; suggested_rating: Grade | null;
  final_rating: Grade; response_ms: number | null; reviewed_at: string; confidence?: Confidence };
export type CachedCard = Omit<StudyCard, 'state'> & { front: string; back: string; keyPoints: string[] };
export type OutboxRow = { client_review_id: string; reviewedAt: string; review: ReviewPayload; prevState: StateRow | null;
  state: StateRow; needsRegrade: 0 | 1; examDate: string | null;
  /** The student's target retention at review time, so a regrade schedules the same way. Older rows have none (0.9). */
  retention?: number };

export class ScholarDB extends Dexie {
  cards!: EntityTable<CachedCard, 'id'>;
  states!: EntityTable<StateRow, 'card_id'>;
  outbox!: EntityTable<OutboxRow, 'client_review_id'>;
  constructor() {
    super('scholar');
    this.version(1).stores({ cards: 'id, deckId', states: 'card_id', outbox: 'client_review_id, reviewedAt' });
  }
}
export const db = new ScholarDB();

export async function cacheDueCards(cards: (StudyCard & { front: string; back: string; keyPoints: string[] })[]): Promise<void> {
  const pending = new Set((await db.outbox.toArray()).map((r) => r.state.card_id));
  await db.transaction('rw', db.cards, db.states, async () => {
    await db.cards.bulkPut(cards.map(({ state: _, ...c }) => c));
    // a server state must not overwrite a local review that has not synced yet
    await db.states.bulkPut(cards.flatMap((c) => (c.state && !pending.has(c.id) ? [c.state] : [])));
  });
}

/** examDate is the exam in force when the card was reviewed, so a later regrade caps the same way. */
export async function enqueueReview(review: ReviewPayload, prevState: StateRow | null, state: StateRow,
  needsRegrade: boolean, examDate: Date | null, retention?: number): Promise<void> {
  await db.transaction('rw', db.outbox, db.states, async () => {
    await db.outbox.put({ client_review_id: review.client_review_id, reviewedAt: review.reviewed_at, review, prevState, state,
      needsRegrade: needsRegrade ? 1 : 0, examDate: examDate?.toISOString() ?? null, retention });
    await db.states.put(state);
  });
}
