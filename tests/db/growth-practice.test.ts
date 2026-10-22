import { afterAll, beforeAll, expect, test } from 'vitest';
import { addPractice } from '@/lib/growth/practice';
import { TEMPLATES } from '@/growth/templates';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
const created: string[] = [];

beforeAll(async () => { A = await createTestUser(); created.push(A.userId); });
afterAll(async () => { await deleteTestUsers(created); });

const decks = async () => (await adminClient().from('decks').select('id,title,subject').eq('user_id', A.userId)).data!;

test('addPractice creates the Writing practice deck once and adds the pattern cards as kept', async () => {
  const r = await addPractice(A.client, A.userId, 'comma_splice');
  expect(r).toMatchObject({ ok: true, added: TEMPLATES.comma_splice!.length });
  const r2 = await addPractice(A.client, A.userId, 'run_on');
  expect(r2).toMatchObject({ ok: true, added: TEMPLATES.run_on!.length });
  expect(await decks()).toEqual([expect.objectContaining({ title: 'Writing practice', subject: 'writing-practice' })]);
  const cards = (await adminClient().from('cards').select('status,concept,source_chunk_id,bloom_level').eq('user_id', A.userId)).data!;
  expect(cards).toHaveLength(TEMPLATES.comma_splice!.length + TEMPLATES.run_on!.length);
  expect(cards.every((c) => c.status === 'kept' && c.source_chunk_id === null && c.bloom_level === 'apply')).toBe(true);
  // The mastery map and session summary show the concept, so it is the readable label, never the key.
  expect([...new Set(cards.map((c) => c.concept))].sort()).toEqual(['Comma splices', 'Run-on sentences']);
});

test('adding the same pattern twice adds nothing the second time', async () => {
  expect(await addPractice(A.client, A.userId, 'comma_splice')).toMatchObject({ ok: true, added: 0 });
  expect((await adminClient().from('cards').select('id').eq('user_id', A.userId).eq('concept', 'Comma splices')).data).toHaveLength(TEMPLATES.comma_splice!.length);
});
