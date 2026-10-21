import { afterAll, beforeAll, expect, test } from 'vitest';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
let essayA: string;
let draftA: string;
let itemA: string;

async function makeEssay(u: User, title = 'Essay') {
  const { data, error } = await u.client.from('essays').insert({ user_id: u.userId, title, essay_type: 'argumentative' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
async function makeDraft(u: User, essayId: string, version = 1) {
  const { data, error } = await u.client.from('drafts')
    .insert({ user_id: u.userId, essay_id: essayId, version, content: 'Some text.', word_count: 2, paragraph_hashes: ['h0'] })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}
async function makeItem(u: User, draftId: string, quote: string | null = 'Some text') {
  const { data, error } = await u.client.from('feedback_items').insert({
    user_id: u.userId, draft_id: draftId, layer: quote ? 'paragraph' : 'global', category: 'evidence', paragraph_index: quote ? 0 : null,
    quote, severity: 'high', summary: 's', hints: ['q1', 'h2'], source: 'llm',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  essayA = await makeEssay(A);
  draftA = await makeDraft(A, essayA);
  itemA = await makeItem(A, draftA);
});
afterAll(async () => { await deleteTestUsers(created); });

test('user B cannot read or insert into user A essay, drafts, or items', async () => {
  expect((await B.client.from('essays').select('id').eq('id', essayA)).data).toEqual([]);
  expect((await B.client.from('drafts').select('id').eq('id', draftA)).data).toEqual([]);
  expect((await B.client.from('feedback_items').select('id').eq('id', itemA)).data).toEqual([]);
  const draft = await B.client.from('drafts')
    .insert({ user_id: B.userId, essay_id: essayA, version: 9, content: 'x', word_count: 1, paragraph_hashes: [] });
  expect(draft.error).not.toBeNull();
  const item = await B.client.from('feedback_items')
    .insert({ user_id: B.userId, draft_id: draftA, layer: 'global', category: 'c', severity: 'low', summary: 's', source: 'llm' });
  expect(item.error).not.toBeNull();
  const ev = await B.client.from('feedback_events').insert({ user_id: B.userId, item_id: itemA, action: 'got_it' });
  expect(ev.error).not.toBeNull();
});

test('draft version is unique per essay', async () => {
  const dup = await A.client.from('drafts')
    .insert({ user_id: A.userId, essay_id: essayA, version: 1, content: 'x', word_count: 1, paragraph_hashes: [] });
  expect(dup.error?.code).toBe('23505');
});

test('consume_essay_quota: same draft twice charges once; sixth draft of the day is false', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const essay = await makeEssay(U);
  const drafts = [];
  for (let v = 1; v <= 6; v++) drafts.push(await makeDraft(U, essay, v));
  const consume = (id: string) => U.client.rpc('consume_essay_quota', { p_draft_id: id });
  expect((await consume(drafts[0])).data).toBe(true);
  expect((await consume(drafts[0])).data).toBe(true);
  for (const d of drafts.slice(1, 5)) expect((await consume(d)).data).toBe(true);
  expect((await consume(drafts[5])).data).toBe(false);
  const { data } = await U.client.from('quota_usage').select('essays').single();
  expect(data?.essays).toBe(5);
  expect((await B.client.rpc('consume_essay_quota', { p_draft_id: drafts[0] })).error?.code).toBe('42501');
});

test('reserve_rewrite: three true then false; two parallel calls with one left give exactly one true', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const draft = await makeDraft(U, await makeEssay(U));
  const items = [await makeItem(U, draft), await makeItem(U, draft), await makeItem(U, draft), await makeItem(U, draft)];
  const reserve = (id: string) => U.client.rpc('reserve_rewrite', { p_item_id: id });
  expect((await reserve(items[0])).data).toBe(true);
  expect((await reserve(items[1])).data).toBe(true);
  const both = await Promise.all([reserve(items[2]), reserve(items[3])]);
  expect(both.map((r) => r.data).sort()).toEqual([false, true]);
  expect((await reserve(items[0])).data).toBe(false);
  expect((await B.client.rpc('reserve_rewrite', { p_item_id: items[0] })).error?.code).toBe('42501');
});

test('direct insert of a rewrite event is denied', async () => {
  const r = await A.client.from('feedback_events').insert({ user_id: A.userId, item_id: itemA, action: 'rewrite' });
  expect(r.error).not.toBeNull();
  const ok = await A.client.from('feedback_events').insert({ user_id: A.userId, item_id: itemA, action: 'viewed_level', level: 1 });
  expect(ok.error).toBeNull();
});

test('user cannot update drafts.content or analyses after insert', async () => {
  await A.client.from('drafts').update({ content: 'changed' }).eq('id', draftA);
  const { data } = await adminClient().from('drafts').select('content').eq('id', draftA).single();
  expect(data?.content).toBe('Some text.');
  const ins = await A.client.from('analyses').insert({ user_id: A.userId, draft_id: draftA, rubric_scores: [], strengths: [] });
  expect(ins.error).toBeNull();
  await A.client.from('analyses').update({ safety_concern: true }).eq('draft_id', draftA);
  const { data: an } = await adminClient().from('analyses').select('safety_concern').eq('draft_id', draftA).single();
  expect(an?.safety_concern).toBe(false);
});

test('layers move only forward: claim from empty or failed, finish only a running layer', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const draft = await makeDraft(U, await makeEssay(U));
  const claim = () => U.client.rpc('claim_layer', { p_draft_id: draft, p_layer: 'global' });
  const finish = (status: string) => U.client.rpc('finish_layer', { p_draft_id: draft, p_layer: 'global', p_status: status });
  expect((await claim()).data).toBe(true);
  expect((await claim()).data).toBe(false);
  expect((await finish('failed')).data).toBe(true);
  expect((await claim()).data).toBe(true);
  expect((await finish('done')).data).toBe(true);
  expect((await claim()).data).toBe(false);
  expect((await finish('failed')).data).toBe(false);
  expect((await U.client.rpc('claim_layer', { p_draft_id: draft, p_layer: 'bogus' })).error).not.toBeNull();
  await U.client.from('drafts').update({ layers: {} }).eq('id', draft);
  const { data } = await adminClient().from('drafts').select('layers').eq('id', draft).single();
  expect(data?.layers).toMatchObject({ global: 'done' });
  expect((await B.client.rpc('claim_layer', { p_draft_id: draft, p_layer: 'paragraphs' })).error?.code).toBe('42501');
});

test('hint levels 3-4 and the rewrite are written once, only through their functions', async () => {
  await A.client.from('feedback_items').update({ hints: [] }).eq('id', itemA);
  const save = () => A.client.rpc('save_hint_levels', { p_item_id: itemA, p_explanation: 'why', p_example: 'eg' });
  expect((await save()).data).toBe(true);
  expect((await save()).data).toBe(false);
  const { data } = await adminClient().from('feedback_items').select('hints').eq('id', itemA).single();
  expect(data?.hints).toEqual(['q1', 'h2', 'why', 'eg']);
  expect((await A.client.rpc('save_rewrite', { p_item_id: itemA, p_rewrite: 'r' })).data).toBe(true);
  expect((await A.client.rpc('save_rewrite', { p_item_id: itemA, p_rewrite: 'r2' })).data).toBe(false);
  await A.client.from('feedback_items').update({ rewrite: null }).eq('id', itemA);
  expect((await adminClient().from('feedback_items').select('rewrite').eq('id', itemA).single()).data?.rewrite).toBe('r');
  expect((await B.client.rpc('save_rewrite', { p_item_id: itemA, p_rewrite: 'x' })).error?.code).toBe('42501');
});

test('student can update status, dispute reason, and highest level of own items', async () => {
  const { error } = await A.client.from('feedback_items').update({ status: 'disputed', dispute_reason: 'I cited it', highest_level: 2 }).eq('id', itemA);
  expect(error).toBeNull();
  const bad = await A.client.from('feedback_items').update({ status: 'deleted' }).eq('id', itemA);
  expect(bad.error).not.toBeNull();
});

test('a layer stuck running for over 5 minutes can be claimed again; a fresh one cannot', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const draft = await makeDraft(U, await makeEssay(U));
  const claim = () => U.client.rpc('claim_layer', { p_draft_id: draft, p_layer: 'global' });
  expect((await claim()).data).toBe(true);
  expect((await claim()).data).toBe(false);
  // Simulate a request killed mid-layer six minutes ago.
  const stale = new Date(Date.now() - 6 * 60_000).toISOString();
  await adminClient().from('drafts').update({ layers: { global: 'running', global_at: stale } }).eq('id', draft);
  expect((await claim()).data).toBe(true);
  expect((await claim()).data).toBe(false);
});
