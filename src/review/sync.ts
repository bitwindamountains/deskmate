import { applyRating, type Grade, type StateRow } from './schedule';
import { db, type OutboxRow, type ReviewPayload } from './store';

export interface SyncDeps {
  recordReview: (review: ReviewPayload, state: StateRow) => Promise<void>;
  grade: (cardId: string, answer: string) => Promise<{ ok: true; suggested: Grade; score: number } | { ok: false }>;
}

/**
 * record_review only moves a state forward, so a regrade cannot correct a review the server already has.
 * A review waiting for its regrade is held back until grading answers or this wait passes, then syncs as rated.
 */
export const REGRADE_WAIT_MS = 24 * 60 * 60 * 1000;

async function regrade(row: OutboxRow, deps: SyncDeps): Promise<'held' | 'kept' | 'replaced'> {
  const r = await deps.grade(row.review.card_id, row.review.answer_text ?? '').catch(() => ({ ok: false as const }));
  if (!r.ok) return 'held';
  // Offline regrade rule (spec §8.2): an applied rating stays unless the LLM differs by more than one step.
  if (Math.abs(r.suggested - row.review.final_rating) <= 1) return 'kept';
  const reviewedAt = new Date(row.review.reviewed_at);
  const { state } = applyRating({ id: row.review.card_id, deckId: '', type: 'basic', importance: 2, state: row.prevState },
    r.suggested, reviewedAt, row.examDate ? new Date(row.examDate) : null);
  row.review = { ...row.review, final_rating: r.suggested, suggested_rating: r.suggested, ai_score: r.score, grade_source: 'llm' };
  row.state = state;
  await db.transaction('rw', db.states, async () => {
    const local = await db.states.get(state.card_id);
    if (!local?.last_review || local.last_review <= row.reviewedAt) await db.states.put(state);
  });
  return 'replaced';
}

// record_review's ownership check: the card was deleted (or is someone else's), so retrying can never succeed.
// A signed-out call is also 42501 ('permission denied for function'), so the message is matched too.
const cardGone = (e: unknown) => (e as { code?: unknown })?.code === '42501' && (e as { message?: unknown }).message === 'card not found';

export async function syncOutbox(deps: SyncDeps, now: Date): Promise<{ sent: number; regraded: number; failed: number; dropped: number }> {
  const out = { sent: 0, regraded: 0, failed: 0, dropped: 0 };
  for (const row of await db.outbox.orderBy('reviewedAt').toArray()) {
    try {
      if (row.needsRegrade) {
        const r = await regrade(row, deps);
        if (r === 'held' && now.getTime() - new Date(row.reviewedAt).getTime() < REGRADE_WAIT_MS) {
          out.failed++;
          continue;
        }
        if (r === 'replaced') out.regraded++;
      }
      await deps.recordReview(row.review, row.state);
      await db.outbox.delete(row.client_review_id);
      out.sent++;
    } catch (e) {
      if (cardGone(e)) {
        await db.outbox.delete(row.client_review_id).catch(() => {});
        out.dropped++;
      } else out.failed++; // keep the row for the next sync
    }
  }
  return out;
}
