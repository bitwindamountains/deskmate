import { afterAll, beforeAll, expect, test } from 'vitest';
import { anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
let C: User;
const created: string[] = [];
let deckA: string;
let deckB: string;
let sourceB: string;
let paidSourceC: string;

const card = (u: User, deck_id: string, extra: Record<string, unknown> = {}) => ({
  user_id: u.userId, deck_id, type: 'basic', front: 'f', back: 'b', source_quote: 'q', concept: 'c', bloom_level: 'remember', importance: 2, ...extra,
});

async function newDeck(u: User): Promise<string> {
  const { data, error } = await u.client.from('decks').insert({ user_id: u.userId, title: 'Biology' }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function newSource(u: User, deck_id: string): Promise<string> {
  const { data, error } = await u.client
    .from('sources').insert({ user_id: u.userId, deck_id, title: 's', kind: 'text', page_count: 1 }).select('id').single();
  if (error) throw error;
  return data.id;
}

const consume = (u: User, p_source_id: string) => u.client.rpc('consume_generation_quota', { p_source_id });

async function generationsToday(u: User): Promise<number | undefined> {
  const { data, error } = await u.client.from('quota_usage').select('generations');
  if (error) throw error;
  expect(data.length).toBeLessThanOrEqual(1); // fresh test user: at most today's row
  return data[0]?.generations;
}

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  C = await createTestUser(); created.push(C.userId);
  deckA = await newDeck(A);
  deckB = await newDeck(B);
  sourceB = await newSource(B, deckB);
  const { error } = await B.client.from('source_chunks').insert({ user_id: B.userId, source_id: sourceB, position: 0, text: 'secret' });
  if (error) throw error;
});

afterAll(async () => {
  // Only the users this file created; every study-content row cascades from auth.users.
  await deleteTestUsers(created);
});

test('user cannot insert a card into another user deck', async () => {
  const { error } = await A.client.from('cards').insert(card(A, deckB));
  expect(error?.code).toBe('42501');
  expect((await A.client.from('cards').insert(card(A, deckA))).error).toBeNull();
});

test('user cannot attach a card to another user chunk', async () => {
  const { data: chunk } = await B.client.from('source_chunks').select('id').single();
  const { error } = await A.client.from('cards').insert(card(A, deckA, { source_chunk_id: chunk!.id }));
  expect(error?.code).toBe('42501');
});

test('user cannot insert a source into another user deck', async () => {
  const { error } = await A.client.from('sources').insert({ user_id: A.userId, deck_id: deckB, title: 's', kind: 'text', page_count: 1 });
  expect(error?.code).toBe('42501');
});

test('user cannot insert a chunk into another user source', async () => {
  const { error } = await A.client.from('source_chunks').insert({ user_id: A.userId, source_id: sourceB, position: 1, text: 'x' });
  expect(error?.code).toBe('42501');
});

test('user cannot read another user chunks, sources, or decks', async () => {
  for (const table of ['source_chunks', 'sources', 'decks'] as const) {
    const { data, error } = await A.client.from(table).select('*').eq('user_id', B.userId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }
});

test('user cannot move a card into another user deck', async () => {
  const { error } = await A.client.from('cards').update({ deck_id: deckB }).eq('deck_id', deckA);
  expect(error?.code).toBe('42501');
});

test('user cannot point a card at another user chunk', async () => {
  const { data: chunk } = await B.client.from('source_chunks').select('id').single();
  const { error } = await A.client.from('cards').update({ source_chunk_id: chunk!.id }).eq('deck_id', deckA);
  expect(error?.code).toBe('42501');
});

test('chunk generated_at can be set but never cleared', async () => {
  const { data, error } = await B.client.from('source_chunks').update({ generated_at: new Date().toISOString() }).eq('source_id', sourceB).select();
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  const cleared = await B.client.from('source_chunks').update({ generated_at: null }).eq('source_id', sourceB);
  expect(cleared.error?.code).toBe('42501'); // RLS with check: generated_at is not null
});

test('chunk text cannot be updated', async () => {
  const { error } = await B.client.from('source_chunks').update({ text: 'changed' }).eq('source_id', sourceB);
  expect(error?.code).toBe('42501'); // column privilege: only generated_at is updatable
});

test('user cannot pre-set quota_consumed_at on a new source', async () => {
  const { error } = await A.client
    .from('sources').insert({ user_id: A.userId, deck_id: deckA, title: 's', kind: 'text', page_count: 1, quota_consumed_at: new Date().toISOString() });
  expect(error?.code).toBe('42501');
});

test('quota: three sources consume, the fourth returns false', async () => {
  const sources = [];
  for (let i = 0; i < 4; i++) sources.push(await newSource(A, deckA));
  const results = [];
  for (const s of sources) {
    const { data, error } = await consume(A, s);
    expect(error).toBeNull();
    results.push(data);
  }
  expect(results).toEqual([true, true, true, false]);
  expect(await generationsToday(A)).toBe(3);
  // An already-paid source still returns true at the limit, and does not count again.
  expect((await consume(A, sources[0])).data).toBe(true);
  expect(await generationsToday(A)).toBe(3);
  const { data: rejected } = await A.client.from('sources').select('quota_consumed_at').eq('id', sources[3]).single();
  expect(rejected?.quota_consumed_at).toBeNull();
});

test('quota: calling twice for the same source consumes once', async () => {
  const s = await newSource(C, await newDeck(C));
  expect((await consume(C, s)).data).toBe(true);
  expect((await consume(C, s)).data).toBe(true);
  expect(await generationsToday(C)).toBe(1);
  paidSourceC = s;
});

test('quota: chunks cannot be added to an already-paid source', async () => {
  const { error } = await C.client.from('source_chunks').insert({ user_id: C.userId, source_id: paidSourceC, position: 0, text: 'more' });
  expect(error?.code).toBe('42501');
});

test('quota: user cannot consume against another user source', async () => {
  const { data, error } = await consume(A, sourceB);
  expect(error?.code).toBe('42501');
  expect(data).toBeNull();
  expect(await generationsToday(B)).toBeUndefined();
});

test('user cannot update quota_usage directly', async () => {
  const { error, data } = await A.client.from('quota_usage').update({ generations: 0 }).eq('user_id', A.userId).select();
  expect(error?.code).toBe('42501');
  expect(data).toBeNull();
  expect(await generationsToday(A)).toBe(3);
});

test('user cannot insert quota_usage directly', async () => {
  const { error } = await B.client.from('quota_usage').insert({ user_id: B.userId, day: '2000-01-01', generations: 0 });
  expect(error?.code).toBe('42501');
});

test('the scholar_private quota function is not reachable through the API', async () => {
  const { error } = await A.client.schema('scholar_private' as never).rpc('consume_generation_quota', { p_source_id: sourceB } as never);
  expect(error?.code).toBe('PGRST106');
});

test('discard_reason outside the enum is rejected', async () => {
  const { error } = await A.client.from('cards').update({ status: 'discarded', discard_reason: 'boring' }).eq('deck_id', deckA);
  expect(error?.code).toBe('23514');
  const ok = await A.client.from('cards').update({ status: 'discarded', discard_reason: 'trivial' }).eq('deck_id', deckA);
  expect(ok.error).toBeNull();
});

test('importance outside 1..3 is rejected', async () => {
  for (const importance of [0, 4]) {
    const { error } = await A.client.from('cards').insert(card(A, deckA, { importance }));
    expect(error?.code).toBe('23514');
  }
});

test('chunk position outside 0..29 is rejected (migration 20261020140000)', async () => {
  const s = await newSource(A, deckA);
  const { error } = await A.client.from('source_chunks').insert({ user_id: A.userId, source_id: s, position: 30, text: 'x' });
  expect(error?.code).toBe('23514');
});

test('chunk text over 15,000 characters is rejected (migration 20261020140000)', async () => {
  const s = await newSource(A, deckA);
  const { error } = await A.client.from('source_chunks').insert({ user_id: A.userId, source_id: s, position: 0, text: 'x'.repeat(15_001) });
  expect(error?.code).toBe('23514');
});

test('anon cannot read decks or call the quota function', async () => {
  const read = await anonClient().from('decks').select('*');
  expect(read.error?.code).toBe('42501');
  const call = await anonClient().rpc('consume_generation_quota', { p_source_id: sourceB });
  expect(call.error?.code).toBe('42501');
});
