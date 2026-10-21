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
const state = (cardId: string, over: Record<string, unknown> = {}) => ({
  card_id: cardId, due: '2026-10-04T09:00:00Z', stability: 3.2, difficulty: 5.1, scheduled_days: 3,
  learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: '2026-10-01T09:00:00Z', ...over,
});
const record = (u: User, p_review: object, p_state: object) => u.client.rpc('record_review', { p_review, p_state });
const reviewsFor = async (cardId: string) => (await adminClient().from('reviews').select('*').eq('card_id', cardId)).data!;
const stateOf = async (cardId: string) => (await adminClient().from('card_states').select('*').eq('card_id', cardId).maybeSingle()).data;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  aCard = await makeCard(A);
  bCard = await makeCard(B);
});
afterAll(async () => { await deleteTestUsers(created); });

test('same client_review_id twice creates one review', async () => {
  const r = review(aCard);
  expect((await record(A, r, state(aCard))).error).toBeNull();
  expect((await record(A, r, state(aCard))).error).toBeNull();
  const rows = await reviewsFor(aCard);
  expect(rows.filter((x) => x.client_review_id === r.client_review_id)).toHaveLength(1);
  expect(await stateOf(aCard)).toMatchObject({ user_id: A.userId, reps: 1, state: 2 });
});

test('older last_review does not overwrite a newer state', async () => {
  const later = { last_review: '2026-10-05T09:00:00Z', due: '2026-10-15T09:00:00Z', reps: 2, scheduled_days: 10 };
  expect((await record(A, review(aCard, { reviewed_at: later.last_review }), state(aCard, later))).error).toBeNull();
  const older = { last_review: '2026-10-03T09:00:00Z', due: '2026-10-03T09:10:00Z', reps: 2, lapses: 1, state: 3 };
  expect((await record(A, review(aCard, { reviewed_at: older.last_review, final_rating: 1 }), state(aCard, older))).error).toBeNull();
  expect(await stateOf(aCard)).toMatchObject({ reps: 2, lapses: 0, state: 2, scheduled_days: 10 });
});

test('cannot record a review for another user card', async () => {
  const { error } = await record(A, review(bCard), state(bCard));
  expect(error?.code).toBe('42501');
  expect(await reviewsFor(bCard)).toHaveLength(0);
  expect(await stateOf(bCard)).toBeNull();
});

test('direct insert into reviews and card_states is denied', async () => {
  const { client_review_id, ...r } = review(aCard);
  expect((await A.client.from('reviews').insert({ ...r, client_review_id, user_id: A.userId })).error).not.toBeNull();
  expect((await A.client.from('card_states').upsert({ ...state(aCard), user_id: A.userId, reps: 99 })).error).not.toBeNull();
  expect((await stateOf(aCard))!.reps).not.toBe(99);
});

test('final_rating 5 and other bad payloads are rejected', async () => {
  for (const [r, s] of [
    [review(aCard, { final_rating: 5 }), state(aCard)],
    [review(aCard, { final_rating: '3' }), state(aCard)],
    [review(aCard), state(aCard, { state: 4 })],
    [review(aCard, { reviewed_at: '2099-01-01T00:00:00Z' }), state(aCard)],
    [review(aCard), state(bCard)],
  ]) {
    expect((await record(A, r, s)).error?.code).toBe('22023');
  }
});

test('users read only their own review rows', async () => {
  expect((await B.client.from('reviews').select('id').eq('card_id', aCard)).data).toEqual([]);
  expect((await B.client.from('card_states').select('card_id').eq('card_id', aCard)).data).toEqual([]);
});

test('grade_cache insert is allowed only for own cards', async () => {
  expect((await A.client.from('grade_cache').insert({ card_id: aCard, answer_hash: 'h1', user_id: A.userId, result: { score: 1 } })).error).toBeNull();
  expect((await A.client.from('grade_cache').insert({ card_id: bCard, answer_hash: 'h1', user_id: A.userId, result: { score: 1 } })).error).not.toBeNull();
  expect((await B.client.from('grade_cache').select('card_id').eq('card_id', aCard)).data).toEqual([]);
});
