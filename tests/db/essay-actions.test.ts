import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertEssay } from '@/lib/essay/create-essay';
import { paragraphHash, paragraphs } from '@/lib/essay/text';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
const content = `${'First paragraph words. '.repeat(15)}\n\n${'Second paragraph words. '.repeat(15)}`;
const input = { title: '  Climate  ', essayType: 'argumentative' as const, gradeLevel: 'college', assignmentPrompt: null, citationStyle: 'APA', content };

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

test('createEssay saves essay and draft 1 with paragraph hashes; another user cannot read it', async () => {
  const r = await insertEssay(A.client, A.userId, input);
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: essay } = await admin.from('essays').select('user_id,title,essay_type,grade_level,assignment_prompt,citation_style').eq('id', r.essayId).single();
  expect(essay).toEqual({ user_id: A.userId, title: 'Climate', essay_type: 'argumentative', grade_level: 'college', assignment_prompt: null, citation_style: 'APA' });
  const { data: drafts } = await admin.from('drafts').select('user_id,version,content,word_count,paragraph_hashes').eq('essay_id', r.essayId);
  const hashes = await Promise.all(paragraphs(content).map(paragraphHash));
  expect(hashes).toHaveLength(2);
  expect(drafts).toEqual([{ user_id: A.userId, version: 1, content, word_count: 90, paragraph_hashes: hashes }]);
  expect((await B.client.from('essays').select('id').eq('id', r.essayId)).data).toEqual([]);
  expect((await B.client.from('drafts').select('id').eq('essay_id', r.essayId)).data).toEqual([]);
});

test('createEssay returns the essay length errors and rejects bad input without saving', async () => {
  expect(await insertEssay(A.client, A.userId, { ...input, content: 'Too short.' }))
    .toEqual({ ok: false, error: 'Add a little more: feedback needs at least 50 words.' });
  expect((await insertEssay(A.client, A.userId, { ...input, content: 'w '.repeat(2001) })).ok).toBe(false);
  expect((await insertEssay(A.client, A.userId, { ...input, essayType: 'poem' as never })).ok).toBe(false);
  expect((await insertEssay(A.client, A.userId, { ...input, title: '   ' })).ok).toBe(false);
  const { data } = await adminClient().from('essays').select('id').eq('user_id', A.userId);
  expect(data).toHaveLength(1);
});
