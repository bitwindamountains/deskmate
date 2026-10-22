import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import { Rating } from 'ts-fsrs';
import type { StateRow } from '@/review/schedule';
import { db, enqueueReview, type ReviewPayload } from '@/review/store';
import { REGRADE_WAIT_MS, syncOutbox, type SyncDeps } from '@/review/sync';

const now = new Date('2026-11-02T09:00:00Z');
const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();

const review = (id: string, reviewed_at: string, over: Partial<ReviewPayload> = {}): ReviewPayload => ({
  client_review_id: id, card_id: `card-${id}`, answer_text: 'answer', grade_source: 'embedding', ai_score: 0.7,
  suggested_rating: Rating.Good, final_rating: Rating.Good, response_ms: 5000, reviewed_at, ...over,
});
const state = (cardId: string, over: Partial<StateRow> = {}): StateRow => ({
  card_id: cardId, due: at(60 * 24 * 4), stability: 4, difficulty: 3, scheduled_days: 4, learning_steps: 0,
  reps: 1, lapses: 0, state: 2, last_review: at(-1), ...over,
});
const deps = (over: Partial<SyncDeps> = {}) => {
  const sent: { review: ReviewPayload; state: StateRow }[] = [];
  const d: SyncDeps = {
    recordReview: vi.fn(async (review, state) => { sent.push({ review, state }); }),
    grade: vi.fn(async () => ({ ok: false as const })),
    ...over,
  };
  return { d, sent };
};

beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.states.clear(), db.cards.clear()]);
});

test('outbox rows sync in reviewed_at order and are deleted', async () => {
  await enqueueReview(review('b', at(-1)), null, state('card-b'), false, null);
  await enqueueReview(review('a', at(-5)), null, state('card-a'), false, null);
  const { d, sent } = deps();
  expect(await syncOutbox(d, now)).toEqual({ sent: 2, regraded: 0, failed: 0, dropped: 0 });
  expect(sent.map((s) => s.review.client_review_id)).toEqual(['a', 'b']);
  expect(await db.outbox.count()).toBe(0);
});

test('enqueueReview stores the new state locally for offline scheduling', async () => {
  await enqueueReview(review('a', at(-1)), null, state('card-a', { reps: 3 }), false, null);
  expect((await db.states.get('card-a'))?.reps).toBe(3);
});

test('failed recordReview keeps the row for the next sync', async () => {
  await enqueueReview(review('a', at(-5)), null, state('card-a'), false, null);
  await enqueueReview(review('b', at(-1)), null, state('card-b'), false, null);
  const recordReview = vi.fn(async (r: ReviewPayload) => { if (r.client_review_id === 'a') throw new Error('offline'); });
  expect(await syncOutbox(deps({ recordReview }).d, now)).toEqual({ sent: 1, regraded: 0, failed: 1, dropped: 0 });
  expect((await db.outbox.toArray()).map((r) => r.client_review_id)).toEqual(['a']);
  const { d } = deps();
  expect(await syncOutbox(d, now)).toEqual({ sent: 1, regraded: 0, failed: 0, dropped: 0 });
  expect(await db.outbox.count()).toBe(0);
});

test('regrade differing by 1 keeps the applied rating', async () => {
  await enqueueReview(review('a', at(-1)), null, state('card-a'), true, null);
  const { d, sent } = deps({ grade: vi.fn(async () => ({ ok: true as const, suggested: Rating.Hard as const, score: 0.5 })) });
  expect(await syncOutbox(d, now)).toEqual({ sent: 1, regraded: 0, failed: 0, dropped: 0 });
  expect(sent[0].review).toMatchObject({ final_rating: Rating.Good, grade_source: 'embedding', ai_score: 0.7 });
  expect(sent[0].state).toEqual(state('card-a'));
});

test('regrade differing by 2 replaces rating and state', async () => {
  const easy = state('card-a', { scheduled_days: 15, due: at(60 * 24 * 15), last_review: at(-1) });
  await enqueueReview(review('a', at(-1), { final_rating: Rating.Easy, suggested_rating: Rating.Easy }), null, easy, true, null);
  const { d, sent } = deps({ grade: vi.fn(async () => ({ ok: true as const, suggested: Rating.Hard as const, score: 0.5 })) });
  expect(await syncOutbox(d, now)).toEqual({ sent: 1, regraded: 1, failed: 0, dropped: 0 });
  expect(sent[0].review).toMatchObject({ final_rating: Rating.Hard, suggested_rating: Rating.Hard, grade_source: 'llm', ai_score: 0.5 });
  // a new card rated Hard stays in learning, due within the hour; the Easy state was 15 days out
  expect(sent[0].state).toMatchObject({ card_id: 'card-a', state: 1, last_review: at(-1) });
  expect(new Date(sent[0].state.due).getTime()).toBeLessThan(new Date(at(60)).getTime());
  expect(await db.states.get('card-a')).toEqual(sent[0].state);
});

test('a regrade does not overwrite a newer local state', async () => {
  await enqueueReview(review('a', at(-10), { final_rating: Rating.Easy }), null, state('card-a', { last_review: at(-10) }), true, null);
  await enqueueReview(review('b', at(-1), { card_id: 'card-a' }), null, state('card-a', { last_review: at(-1), reps: 2 }), false, null);
  const { d } = deps({ grade: vi.fn(async () => ({ ok: true as const, suggested: Rating.Again as const, score: 0.1 })) });
  await syncOutbox(d, now);
  expect((await db.states.get('card-a'))?.reps).toBe(2);
});

test('regrade unavailable holds the review, then syncs the local rating after the wait', async () => {
  await enqueueReview(review('a', at(-1)), null, state('card-a'), true, null);
  const { d, sent } = deps();
  expect(await syncOutbox(d, now)).toEqual({ sent: 0, regraded: 0, failed: 1, dropped: 0 });
  expect((await db.outbox.get('a'))?.needsRegrade).toBe(1);

  const later = new Date(now.getTime() + REGRADE_WAIT_MS);
  expect(await syncOutbox(d, later)).toEqual({ sent: 1, regraded: 0, failed: 0, dropped: 0 });
  expect(sent[0].review).toMatchObject({ final_rating: Rating.Good, grade_source: 'embedding' });
  expect(await db.outbox.count()).toBe(0);
});

test('a queued review for a deleted card is dropped, other failures stay queued', async () => {
  await enqueueReview(review('gone', at(-5)), null, state('card-gone'), false, null);
  await enqueueReview(review('denied', at(-3)), null, state('card-denied'), false, null);
  await enqueueReview(review('offline', at(-1)), null, state('card-offline'), false, null);
  const recordReview = vi.fn(async (r: ReviewPayload) => {
    // record_review raises 42501 'card not found' once the card is deleted; a signed-out call is also 42501, but must stay queued
    if (r.client_review_id === 'gone') throw { code: '42501', message: 'card not found' };
    if (r.client_review_id === 'denied') throw { code: '42501', message: 'permission denied for function record_review' };
    throw new Error('offline');
  });
  expect(await syncOutbox(deps({ recordReview }).d, now)).toEqual({ sent: 0, regraded: 0, failed: 2, dropped: 1 });
  expect((await db.outbox.toArray()).map((r) => r.client_review_id).sort()).toEqual(['denied', 'offline']);
});
