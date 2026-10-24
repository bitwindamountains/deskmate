import { afterAll, beforeAll, expect, test } from 'vitest';
import { exportMyData } from '@/lib/account/export';
import { reportProblem } from '@/lib/report/report-problem';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

async function seed(u: User) {
  await u.client.from('profiles').insert({ user_id: u.userId });
  const deck = (await u.client.from('decks').insert({ user_id: u.userId, title: 'Bio' }).select('id').single()).data!.id;
  const card = (await adminClient().from('cards').insert({ user_id: u.userId, deck_id: deck, source_chunk_id: null, type: 'basic', front: 'Q',
    back: 'A', key_points: [], source_quote: '', concept: 'Cells', bloom_level: 'remember', importance: 2, status: 'kept',
    embedding: Array(384).fill(0.1) }).select('id').single()).data!.id;
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const draft = (await u.client.from('drafts').insert({ user_id: u.userId, essay_id: essay, version: 1, content: 'Text.', word_count: 1,
    paragraph_hashes: ['a'] }).select('id').single()).data!.id;
  const item = (await adminClient().from('feedback_items').insert({ user_id: u.userId, draft_id: draft, layer: 'global', category: 'evidence',
    severity: 'high', summary: 'Claim lacks evidence', hints: [], source: 'llm' }).select('id').single()).data!.id;
  await adminClient().from('quota_usage').insert({ user_id: u.userId, day: '2026-10-24', essays: 2 });
  return { deck, card, essay, item };
}
let a: Awaited<ReturnType<typeof seed>>;
let b: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  [a, b] = await Promise.all([seed(A), seed(B)]);
});
afterAll(async () => { await deleteTestUsers(created); });

test('reports: own card or feedback item only, known reasons, notes up to 500 characters', async () => {
  await reportProblem(A.client, A.userId, { target: 'card', targetId: a.card, reason: 'grading', note: 'Marked wrong but was right' });
  await reportProblem(A.client, A.userId, { target: 'feedback_item', targetId: a.item, reason: 'unfair', note: '' });
  await expect(reportProblem(A.client, A.userId, { target: 'card', targetId: b.card, reason: 'wrong', note: '' })).rejects.toThrow();
  const raw = (row: object) => A.client.from('problem_reports').insert({ user_id: A.userId, target: 'card', target_id: a.card, ...row });
  expect((await raw({ reason: 'spam' })).error).not.toBeNull();
  expect((await raw({ reason: 'other', note: 'x'.repeat(501) })).error).not.toBeNull();
  expect((await B.client.from('problem_reports').select('id')).data).toEqual([]);
  expect((await A.client.from('problem_reports').select('reason').order('created_at')).data!.map((r) => r.reason)).toEqual(['grading', 'unfair']);
});

test('a report keeps a copy of the reported text, even after the card is deleted', async () => {
  const card = (await adminClient().from('cards').insert({ user_id: A.userId, deck_id: a.deck, source_chunk_id: null, type: 'basic',
    front: 'What makes ATP?', back: 'Mitochondria', key_points: [], source_quote: '', concept: 'Cells', bloom_level: 'remember',
    importance: 2, status: 'kept' }).select('id').single()).data!.id;
  await reportProblem(A.client, A.userId, { target: 'card', targetId: card, reason: 'wrong', note: '' });
  await A.client.from('cards').delete().eq('id', card);
  const snap = async (id: string) => (await A.client.from('problem_reports').select('snapshot').eq('target_id', id).single()).data!.snapshot;
  expect(await snap(card)).toEqual({ front: 'What makes ATP?', back: 'Mitochondria' });
  expect(await snap(a.item)).toEqual({ summary: 'Claim lacks evidence', revised_summary: null, quote: null });
});

test('export has every own row, nobody else rows, and no embeddings', async () => {
  const data = (await exportMyData(A.client))!;
  expect(data.decks.map((r) => r.id)).toEqual([a.deck]);
  expect(data.cards).toHaveLength(1);
  expect(data.cards[0]).not.toHaveProperty('embedding');
  expect(data.essays.map((r) => r.id)).toEqual([a.essay]);
  expect(data.feedback_items.map((r) => r.id)).toEqual([a.item]);
  expect(data.profiles).toHaveLength(1);
  expect(data.quota_usage).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain(B.userId);
});

test('delete_my_data removes all Scholar content, keeps quota counters and the sign-in, and leaves others alone', async () => {
  expect((await anonClient().rpc('delete_my_data')).error).not.toBeNull();
  expect((await A.client.rpc('delete_my_data')).error).toBeNull();
  const left = (await exportMyData(A.client))!;
  for (const [table, rows] of Object.entries(left)) {
    expect(rows.length, table).toBe(['quota_usage', 'llm_calls'].includes(table) ? rows.length : 0);
  }
  expect(left.quota_usage).toHaveLength(1);
  expect((await adminClient().auth.admin.getUserById(A.userId)).data.user).not.toBeNull();
  const other = (await exportMyData(B.client))!;
  expect([other.decks.length, other.cards.length, other.essays.length, other.feedback_items.length]).toEqual([1, 1, 1, 1]);
});

test('ping answers without a user', async () => {
  expect(await anonClient().rpc('ping')).toMatchObject({ error: null, data: true });
});
