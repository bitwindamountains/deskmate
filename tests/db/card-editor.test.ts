import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { loadDeckSummaries, loadStudy } from '@/lib/review/load';
import { deleteCards, updateStatus } from '@/lib/triage/card-actions';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string; deckId: string; chunkId: string };
let A: User;
let B: User;
const created: string[] = [];

async function makeUser(): Promise<User> {
  const u = await createTestUser();
  created.push(u.userId);
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Deck', title: 'Notes', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(40) }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  return { ...u, deckId: src!.deck_id, chunkId: chunk!.id };
}

async function makeCard(u: User): Promise<string> {
  const { data, error } = await adminClient().from('cards').insert({
    user_id: u.userId, deck_id: u.deckId, source_chunk_id: u.chunkId, type: 'basic', front: 'F', back: 'B',
    source_quote: 'q', concept: 'c', bloom_level: 'remember', importance: 2, status: 'kept',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

// A past-due reviewed state, so the card counts as due on the Study page.
async function review(u: User, cardId: string) {
  const { error } = await u.client.rpc('record_review', {
    p_review: { client_review_id: randomUUID(), card_id: cardId, answer_text: 'B', grade_source: 'exact', ai_score: 1,
      suggested_rating: 3, final_rating: 3, response_ms: 4000, reviewed_at: '2026-10-01T09:00:00Z' },
    p_state: { card_id: cardId, due: '2026-10-04T09:00:00Z', stability: 3.2, difficulty: 5.1, scheduled_days: 3,
      learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: '2026-10-01T09:00:00Z' },
  });
  if (error) throw error;
}
const admin = () => adminClient();
const stateOf = async (id: string) => (await admin().from('card_states').select('*').eq('card_id', id).maybeSingle()).data;
const statusOf = async (id: string) => (await admin().from('cards').select('status').eq('id', id).maybeSingle()).data?.status;

beforeAll(async () => {
  A = await makeUser();
  B = await makeUser();
});
afterAll(async () => { await deleteTestUsers(created); });

test('bulk suspend then unsuspend keeps the card state (reps, due) unchanged', async () => {
  const ids = [await makeCard(A), await makeCard(A)];
  for (const id of ids) await review(A, id);
  const before = await Promise.all(ids.map(stateOf));
  await updateStatus(A.client, A.userId, ids, 'suspended');
  expect(await Promise.all(ids.map(statusOf))).toEqual(['suspended', 'suspended']);
  await updateStatus(A.client, A.userId, ids, 'kept');
  expect(await Promise.all(ids.map(statusOf))).toEqual(['kept', 'kept']);
  expect(await Promise.all(ids.map(stateOf))).toEqual(before);
  expect(before[0]).toMatchObject({ reps: 1 });
});

test('suspended cards are absent from loadStudy and from the Study deck counts', async () => {
  const id = await makeCard(A);
  await review(A, id);
  const count = async () => {
    const { cards } = await loadStudy(A.client, A.deckId);
    const deck = (await loadDeckSummaries(A.client)).find((d) => d.id === A.deckId)!;
    return { inStudy: cards.some((c) => c.id === id), kept: deck.kept, due: deck.due };
  };
  const before = await count();
  expect(before.inStudy).toBe(true);
  await updateStatus(A.client, A.userId, [id], 'suspended');
  expect(await count()).toEqual({ inStudy: false, kept: before.kept - 1, due: before.due - 1 });
  await updateStatus(A.client, A.userId, [id], 'kept');
  expect(await count()).toEqual(before);
});

test('the Study deck counts slipping cards (lapses >= 4)', async () => {
  const id = await makeCard(A);
  const leeches = async () => (await loadDeckSummaries(A.client)).find((d) => d.id === A.deckId)!.leeches;
  const before = await leeches();
  await admin().from('card_states').insert({ card_id: id, user_id: A.userId, due: '2026-10-04T09:00:00Z', stability: 1, difficulty: 8,
    scheduled_days: 1, learning_steps: 0, reps: 6, lapses: 4, state: 3, last_review: '2026-10-01T09:00:00Z' });
  expect(await leeches()).toBe(before + 1);
});

test('delete asks first and removes cards with their states and reviews', async () => {
  const id = await makeCard(A);
  await review(A, id);
  await deleteCards(A.client, A.userId, [id]);
  expect(await statusOf(id)).toBeUndefined();
  expect(await stateOf(id)).toBeNull();
  expect((await admin().from('reviews').select('card_id').eq('card_id', id)).data).toEqual([]);
});

test('another user card ids are ignored by setStatus and removeCards', async () => {
  const mine = await makeCard(A);
  const theirs = await makeCard(B);
  await updateStatus(A.client, A.userId, [mine, theirs], 'suspended');
  expect(await statusOf(mine)).toBe('suspended');
  expect(await statusOf(theirs)).toBe('kept');
  await deleteCards(A.client, A.userId, [mine, theirs]);
  expect(await statusOf(mine)).toBeUndefined();
  expect(await statusOf(theirs)).toBe('kept');
});

test('deleteCards rejects bad input before touching the DB', async () => {
  await expect(deleteCards(A.client, A.userId, [])).rejects.toThrow("We couldn't save that change.");
  await expect(deleteCards(A.client, A.userId, ['not-a-uuid'])).rejects.toThrow();
  await expect(deleteCards(A.client, A.userId, Array(201).fill(randomUUID()))).rejects.toThrow();
});
