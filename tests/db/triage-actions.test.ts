import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { updateCard, updateEmbeddings, updateStatus } from '@/lib/triage/card-actions';
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
    source_quote: 'q', concept: 'c', bloom_level: 'remember', importance: 2,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const row = async (id: string) => (await adminClient().from('cards').select('front,back,status,discard_reason,embedding').eq('id', id).single()).data!;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  aCard = await makeCard(A);
  bCard = await makeCard(B);
});
afterAll(async () => { await deleteTestUsers(created); });

test('setCardStatus cannot change another user cards', async () => {
  await updateStatus(A.client, A.userId, [aCard, bCard], 'discarded', 'wrong');
  expect(await row(aCard)).toMatchObject({ status: 'discarded', discard_reason: 'wrong' });
  expect(await row(bCard)).toMatchObject({ status: 'pending', discard_reason: null });
  await updateStatus(A.client, A.userId, [aCard], 'kept');
  expect(await row(aCard)).toMatchObject({ status: 'kept', discard_reason: null });
});

test('setCardStatus rejects bad input before touching the DB', async () => {
  await expect(updateStatus(A.client, A.userId, ['not-a-uuid'], 'kept')).rejects.toThrow("We couldn't save that change.");
  await expect(updateStatus(A.client, A.userId, [aCard], 'pending' as never)).rejects.toThrow();
  await expect(updateStatus(A.client, A.userId, Array(201).fill(aCard), 'kept')).rejects.toThrow();
});

test('editCard rejects an empty front', async () => {
  await expect(updateCard(A.client, A.userId, aCard, { front: '   ' })).rejects.toThrow("We couldn't save that change.");
  await updateCard(A.client, A.userId, aCard, { front: '  New  ', back: 'Back' });
  expect(await row(aCard)).toMatchObject({ front: 'New', back: 'Back' });
  await updateCard(A.client, A.userId, bCard, { front: 'Hacked' });
  expect((await row(bCard)).front).toBe('F');
});

test('saveEmbeddings stores 384 finite numbers and rejects other shapes', async () => {
  const v = Array.from({ length: 384 }, (_, i) => i / 384);
  await updateEmbeddings(A.client, A.userId, [{ id: aCard, embedding: v }, { id: bCard, embedding: v }]);
  expect((await row(aCard)).embedding).toHaveLength(384);
  expect((await row(bCard)).embedding).toBeNull();
  await expect(updateEmbeddings(A.client, A.userId, [{ id: aCard, embedding: [1, 2] }])).rejects.toThrow();
  await expect(updateEmbeddings(A.client, A.userId, [{ id: aCard, embedding: [...v.slice(1), NaN] }])).rejects.toThrow();
});
