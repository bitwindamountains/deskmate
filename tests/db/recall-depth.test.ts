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

test('a card can be suspended and is excluded by status filters', async () => {
  const card = await makeCard(A);
  expect((await A.client.from('cards').update({ status: 'suspended' }).eq('id', card)).error).toBeNull();
  const kept = (await A.client.from('cards').select('id').eq('status', 'kept')).data!.map((c) => c.id);
  expect(kept).not.toContain(card);
  expect((await A.client.from('cards').update({ status: 'archived' }).eq('id', card)).error).not.toBeNull();
});

test('record_review stores confidence 1-3 and rejects 0, 4 and "3"', async () => {
  const r = review(aCard, { confidence: 3 });
  expect((await record(A, r, state(aCard))).error).toBeNull();
  const { data } = await adminClient().from('reviews').select('confidence').eq('client_review_id', r.client_review_id).single();
  expect(data?.confidence).toBe(3);
  for (const bad of [0, 4, '3', 2.5]) {
    expect((await record(A, review(aCard, { confidence: bad }), state(aCard))).error?.code).toBe('22023');
  }
});

test('record_review without confidence still works (outbox from before this release)', async () => {
  const r = review(aCard);
  expect((await record(A, r, state(aCard))).error).toBeNull();
  const nulled = review(aCard, { confidence: null });
  expect((await record(A, nulled, state(aCard))).error).toBeNull();
  const rows = (await adminClient().from('reviews').select('confidence').in('client_review_id', [r.client_review_id, nulled.client_review_id])).data!;
  expect(rows.map((x) => x.confidence)).toEqual([null, null]);
});

test('card_aids: owner can insert and read for own card only; no update', async () => {
  expect((await A.client.from('card_aids').insert({ card_id: aCard, user_id: A.userId, result: { mnemonic: 'm' } })).error).toBeNull();
  expect((await A.client.from('card_aids').insert({ card_id: bCard, user_id: A.userId, result: {} })).error).not.toBeNull();
  expect((await B.client.from('card_aids').select('card_id').eq('card_id', aCard)).data).toEqual([]);
  await A.client.from('card_aids').update({ result: { mnemonic: 'changed' } }).eq('card_id', aCard);
  expect((await adminClient().from('card_aids').select('result').eq('card_id', aCard).single()).data?.result).toEqual({ mnemonic: 'm' });
});
