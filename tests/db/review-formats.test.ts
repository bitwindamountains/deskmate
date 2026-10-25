import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
let aCard: string;
let bCard: string;

async function makeCard(u: User): Promise<string> {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Deck', title: 'Notes', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(40) }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  const { data, error } = await admin.from('cards').insert({
    user_id: u.userId, deck_id: src!.deck_id, source_chunk_id: chunk!.id, type: 'basic', front: 'F', back: 'B',
    source_quote: 'q', concept: 'c', bloom_level: 'remember', importance: 2, status: 'kept',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

const review = (cardId: string, over: Record<string, unknown> = {}) => ({
  client_review_id: randomUUID(), card_id: cardId, answer_text: 'B', grade_source: 'exact', ai_score: 1,
  suggested_rating: 3, final_rating: 3, response_ms: 4000, reviewed_at: '2026-10-01T09:00:00Z', ...over,
});
const state = (cardId: string) => ({
  card_id: cardId, due: '2026-10-04T09:00:00Z', stability: 3.2, difficulty: 5.1, scheduled_days: 3,
  learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: '2026-10-01T09:00:00Z',
});
const record = (u: User, p_review: object, p_state: object) => u.client.rpc('record_review', { p_review, p_state });

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  aCard = await makeCard(A);
  bCard = await makeCard(B);
});
afterAll(async () => { await deleteTestUsers(created); });

test('record_review accepts the review formats, each within its rating cap', async () => {
  for (const [source, final] of [['choice', 2], ['blank', 3], ['reverse', 4]] as const) {
    const r = review(aCard, { grade_source: source, final_rating: final, suggested_rating: final, ai_score: null });
    expect((await record(A, r, state(aCard))).error).toBeNull();
    const { data } = await adminClient().from('reviews').select('grade_source').eq('client_review_id', r.client_review_id).single();
    expect(data?.grade_source).toBe(source);
  }
});

test('record_review refuses an unknown source and a rating above a format cap', async () => {
  expect((await record(A, review(aCard, { grade_source: 'guess' }), state(aCard))).error?.code).toBe('22023');
  expect((await record(A, review(aCard, { grade_source: 'choice', final_rating: 3 }), state(aCard))).error?.code).toBe('22023');
  expect((await record(A, review(aCard, { grade_source: 'blank', final_rating: 4 }), state(aCard))).error?.code).toBe('22023');
  // the table holds the same rule for any writer that skips the function
  const { error } = await adminClient().from('reviews').insert({ client_review_id: randomUUID(), card_id: aCard, user_id: A.userId,
    grade_source: 'choice', final_rating: 4, reviewed_at: '2026-10-01T09:00:00Z' });
  expect(error).not.toBeNull();
});

test('another user still cannot record a review on my card with a new format', async () => {
  expect((await record(B, review(aCard, { grade_source: 'choice', final_rating: 2 }), state(aCard))).error?.code).toBe('42501');
  void bCard;
});
