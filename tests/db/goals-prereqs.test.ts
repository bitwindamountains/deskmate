import { afterAll, beforeAll, expect, test } from 'vitest';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
let deck: string;
let ids: string[];
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  deck = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Bio' }).select('id').single()).data!.id;
  const rows = ['Q1', 'Q2', 'Q3'].map((front) => ({ user_id: A.userId, deck_id: deck, source_chunk_id: null, type: 'basic', front, back: 'A',
    key_points: [], source_quote: '', concept: 'Cells', bloom_level: 'remember', importance: 2, status: 'kept' }));
  ids = (await adminClient().from('cards').insert(rows).select('id,front').order('front')).data!.map((r) => r.id);
});
afterAll(async () => { await deleteTestUsers(created); });

const matched = async () => (await adminClient().from('cards').select('id').eq('deck_id', deck).eq('goal_match', true)).data!.map((r) => r.id).sort();

test('set_goal_matches saves the goals and flips exactly the given cards, in one call', async () => {
  const one = await A.client.rpc('set_goal_matches', { p_deck: deck, p_goals: 'Explain cell respiration', p_ids: [ids[0], ids[1]] });
  expect(one).toMatchObject({ error: null, data: 2 });
  expect(await matched()).toEqual([ids[0], ids[1]].sort());
  expect((await A.client.rpc('set_goal_matches', { p_deck: deck, p_goals: 'x', p_ids: [ids[2]] })).data).toBe(1);
  expect(await matched()).toEqual([ids[2]]);
  // null ids: the model couldn't load, so the goals save and the matches stay
  expect((await A.client.rpc('set_goal_matches', { p_deck: deck, p_goals: 'New goals', p_ids: null })).data).toBe(1);
  expect(await matched()).toEqual([ids[2]]);
  expect((await adminClient().from('decks').select('goals').eq('id', deck).single()).data!.goals).toBe('New goals');
});

test('set_goal_matches refuses another user deck and goals over 5,000 characters', async () => {
  expect((await B.client.rpc('set_goal_matches', { p_deck: deck, p_goals: 'x', p_ids: [] })).error).not.toBeNull();
  expect((await A.client.rpc('set_goal_matches', { p_deck: deck, p_goals: 'x'.repeat(5001), p_ids: [] })).error).not.toBeNull();
  expect(await matched()).toEqual([ids[2]]);
});

test('concept_prereqs: own deck only, normalized keys, no self edges, private to the owner', async () => {
  const edge = (concept: string, prereq: string) => ({ user_id: A.userId, deck_id: deck, concept, prereq });
  expect((await A.client.from('concept_prereqs').insert(edge('cell respiration', 'glycolysis'))).error).toBeNull();
  expect((await A.client.from('concept_prereqs').insert(edge('cells', 'cells'))).error).not.toBeNull();
  expect((await A.client.from('concept_prereqs').insert(edge('Cells ', 'atp'))).error).not.toBeNull();
  expect((await B.client.from('concept_prereqs').insert({ ...edge('a', 'b'), user_id: B.userId })).error).not.toBeNull();
  expect((await B.client.from('concept_prereqs').select('id')).data).toEqual([]);
  const del = await A.client.from('concept_prereqs').delete().eq('deck_id', deck).eq('concept', 'cell respiration').select('id');
  expect(del.data).toHaveLength(1);
});
