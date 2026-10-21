import { afterAll, beforeAll, expect, test } from 'vitest';
import { essayChecksLeft, essaysWithOpenPriorities } from '@/lib/essay/summary';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

async function essay(u: User, title: string, versions: number, openItems: number[]) {
  const e = (await u.client.from('essays').insert({ user_id: u.userId, title, essay_type: 'argumentative' }).select('id').single()).data!.id as string;
  for (let v = 1; v <= versions; v++) {
    const d = (await u.client.from('drafts').insert({ user_id: u.userId, essay_id: e, version: v, content: 'x', word_count: 1, paragraph_hashes: [] })
      .select('id').single()).data!.id;
    const n = openItems[v - 1] ?? 0;
    // one request per draft: n open items plus one closed one that must not count
    const { error } = await adminClient().from('feedback_items').insert(Array.from({ length: n + 1 }, (_, i) => ({ user_id: u.userId, draft_id: d,
      layer: 'global', category: 'c', severity: 'low', summary: 's', source: 'llm', status: i < n ? 'open' : 'got_it' })));
    if (error) throw error;
  }
  return e;
}

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

test('essay checks left counts down from 5 with today\'s quota', async () => {
  expect(await essayChecksLeft(A.client)).toBe(5);
  const e = await essay(A, 'Quota', 2, []);
  const drafts = (await A.client.from('drafts').select('id').eq('essay_id', e)).data!;
  for (const d of drafts) await A.client.rpc('consume_essay_quota', { p_draft_id: d.id });
  expect(await essayChecksLeft(A.client)).toBe(3);
});

test('only the latest draft counts, open items cap at 3, and other users are invisible', async () => {
  const climate = await essay(A, 'Climate', 2, [5, 4]);   // latest draft: 4 open -> 3
  await essay(A, 'Done', 2, [2, 0]);                      // latest draft: none open -> left out
  const hamlet = await essay(A, 'Hamlet', 1, [1]);
  await essay(B, 'Theirs', 1, [2]);
  const got = await essaysWithOpenPriorities(A.client);
  expect(got).toEqual(expect.arrayContaining([{ id: climate, title: 'Climate', openTop3: 3 }, { id: hamlet, title: 'Hamlet', openTop3: 1 }]));
  expect(got.map((e) => e.title).sort()).toEqual(['Climate', 'Hamlet']);
});
