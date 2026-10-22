import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadGrowth } from '@/lib/growth/load';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

async function essayWith(u: User, title: string, words: number, items: { category: string; status?: string }[][], checked = true) {
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title, essay_type: 'argumentative' }).select('id').single()).data!.id;
  for (const [i, draftItems] of items.entries()) {
    const draft = (await u.client.from('drafts').insert({ user_id: u.userId, essay_id: essay, version: i + 1, content: `Draft ${i}.`,
      word_count: words, paragraph_hashes: ['a'] }).select('id').single()).data!.id;
    if (checked) await adminClient().from('drafts').update({ layers: { global: 'done' } }).eq('id', draft);
    if (draftItems.length) {
      const { error } = await adminClient().from('feedback_items').insert(draftItems.map((it) => ({ user_id: u.userId, draft_id: draft, layer: 'global',
        category: it.category, severity: 'medium', summary: 's', rubric_criterion: null, source: 'llm', status: it.status ?? 'open' })));
      if (error) throw error;
    }
  }
  return essay as string;
}

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

test('loadGrowth reads only version-1 drafts and skips withdrawn items; another user sees nothing', async () => {
  await essayWith(A, 'First', 400, [[{ category: 'Comma splice' }, { category: 'Run-on sentence' }, { category: 'Comma splice', status: 'withdrawn' }],
    [{ category: 'Comma splice' }, { category: 'Comma splice' }]]); // draft 2 is a revision: ignored
  await essayWith(A, 'Second', 600, [[{ category: 'Comma splice' }, { category: 'Overall flow' }]]);
  const rows = await loadGrowth(A.client);
  expect(rows.map((r) => ({ title: r.title, words: r.words, patterns: [...r.patterns].sort() }))).toEqual([
    { title: 'First', words: 400, patterns: ['comma_splice', 'run_on'] },
    { title: 'Second', words: 600, patterns: ['comma_splice'] },
  ]);
  expect(await loadGrowth(B.client)).toEqual([]);
});

test('an essay whose feedback has not finished is left out of the growth profile', async () => {
  const U = await createTestUser(); created.push(U.userId);
  await essayWith(U, 'Checked', 400, [[{ category: 'Comma splice' }]]);
  await essayWith(U, 'Saved, never checked', 400, [[]], false);
  expect((await loadGrowth(U.client)).map((r) => r.title)).toEqual(['Checked']);
});
