import { afterAll, beforeAll, expect, test } from 'vitest';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
let aDraft: string;
let aItem: string;
let bItem: string;

async function newDraft(u: User) {
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const { data, error } = await u.client.from('drafts')
    .insert({ user_id: u.userId, essay_id: essay, version: 1, content: 'Phones distract.\n\nThey do.', word_count: 4, paragraph_hashes: ['a', 'b'] })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}
async function newItem(u: User, draftId: string) {
  const { data, error } = await adminClient().from('feedback_items').insert({ user_id: u.userId, draft_id: draftId, layer: 'global',
    category: 'evidence', severity: 'high', summary: 'Claim lacks evidence', source: 'llm' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const item = async (id: string) => (await adminClient().from('feedback_items').select('status,revised_summary').eq('id', id).single()).data!;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  aDraft = await newDraft(A);
  aItem = await newItem(A, aDraft);
  bItem = await newItem(B, await newDraft(B));
});
afterAll(async () => { await deleteTestUsers(created); });

test('feedback_items accepts status withdrawn; revise_item sets revised_summary for the owner only', async () => {
  expect((await A.client.from('feedback_items').update({ status: 'withdrawn' }).eq('id', aItem)).error).toBeNull();
  expect((await item(aItem)).status).toBe('withdrawn');
  expect((await A.client.rpc('revise_item', { p_item_id: aItem, p_summary: 'Add one source for the claim.' })).error).toBeNull();
  expect((await item(aItem)).revised_summary).toBe('Add one source for the claim.');
  expect((await A.client.rpc('revise_item', { p_item_id: bItem, p_summary: 'x' })).error?.code).toBe('42501');
  expect((await A.client.rpc('revise_item', { p_item_id: aItem, p_summary: '' })).error?.code).toBe('22023');
  // not writable directly
  await A.client.from('feedback_items').update({ revised_summary: 'direct' } as never).eq('id', aItem);
  expect((await item(aItem)).revised_summary).toBe('Add one source for the claim.');
});

test('set_outline writes once; a second call does not overwrite', async () => {
  const outline = [{ paragraph_index: 0, summary: 'Phones distract', flag: null }];
  expect((await A.client.rpc('set_outline', { p_draft_id: aDraft, p_outline: outline })).data).toBe(true);
  expect((await A.client.rpc('set_outline', { p_draft_id: aDraft, p_outline: [] })).data).toBe(false);
  expect((await adminClient().from('drafts').select('outline').eq('id', aDraft).single()).data?.outline).toEqual(outline);
  expect((await B.client.rpc('set_outline', { p_draft_id: aDraft, p_outline: [] })).error?.code).toBe('42501');
});

test('analyses stores prompt_alignment', async () => {
  const alignment = [{ part: 'Take a position', status: 'addressed', note: '' }];
  expect((await A.client.from('analyses').insert({ draft_id: aDraft, user_id: A.userId, rubric_scores: [], strengths: [],
    prompt_alignment: alignment })).error).toBeNull();
  expect((await A.client.from('analyses').select('prompt_alignment').eq('draft_id', aDraft).single()).data?.prompt_alignment).toEqual(alignment);
});

test('feedback_messages: owner inserts for own item only; no update or delete', async () => {
  const msg = { item_id: aItem, user_id: A.userId, role: 'student', kind: 'dispute', text: 'I cite a source later.' };
  const { data, error } = await A.client.from('feedback_messages').insert(msg).select('id').single();
  expect(error).toBeNull();
  expect((await A.client.from('feedback_messages').insert({ ...msg, item_id: bItem })).error).not.toBeNull();
  expect((await A.client.from('feedback_messages').insert({ ...msg, verdict: 'maybe' })).error).not.toBeNull();
  expect((await B.client.from('feedback_messages').select('id').eq('item_id', aItem)).data).toEqual([]);
  await A.client.from('feedback_messages').update({ text: 'changed' }).eq('id', data!.id);
  await A.client.from('feedback_messages').delete().eq('id', data!.id);
  expect((await adminClient().from('feedback_messages').select('text').eq('id', data!.id).single()).data?.text).toBe(msg.text);
});

test('self_assessments: owner-only insert and select', async () => {
  const sa = { draft_id: aDraft, user_id: A.userId, scores: [{ criterion: 'Thesis', score: 3 }], weakness: 'Evidence' };
  expect((await B.client.from('self_assessments').insert({ ...sa, user_id: B.userId })).error).not.toBeNull();
  expect((await A.client.from('self_assessments').insert(sa)).error).toBeNull();
  expect((await A.client.from('self_assessments').insert({ ...sa, weakness: 'x'.repeat(301) })).error).not.toBeNull();
  expect((await B.client.from('self_assessments').select('draft_id').eq('draft_id', aDraft)).data).toEqual([]);
});

