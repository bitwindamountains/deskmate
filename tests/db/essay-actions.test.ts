import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertDraft, insertEssay } from '@/lib/essay/create-essay';
import { paragraphHash, paragraphs } from '@/lib/essay/text';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
// Three English words per sentence: 90 words, and it passes the English-only check.
const content = `${'The first paragraph. '.repeat(15)}\n\n${'The second paragraph. '.repeat(15)}`;
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

const edited = content.replace('second paragraph', 'revised paragraph');

test('saveDraft with unchanged text returns the existing draft', async () => {
  const r = await insertEssay(A.client, A.userId, input);
  if (!r.ok) throw new Error(r.error);
  const d1 = (await adminClient().from('drafts').select('id').eq('essay_id', r.essayId).single()).data!.id;
  expect(await insertDraft(A.client, A.userId, r.essayId, content)).toEqual({ ok: true, draftId: d1, version: 1, unchanged: true });
  expect((await adminClient().from('drafts').select('id').eq('essay_id', r.essayId)).data).toHaveLength(1);
});

test('two saveDraft calls at once produce versions 2 and 3, no error', async () => {
  const r = await insertEssay(A.client, A.userId, input);
  if (!r.ok) throw new Error(r.error);
  const both = await Promise.all([insertDraft(A.client, A.userId, r.essayId, edited), insertDraft(A.client, A.userId, r.essayId, `${edited} More.`)]);
  expect(both.every((b) => b.ok)).toBe(true);
  expect(both.map((b) => (b.ok ? b.version : 0)).sort()).toEqual([2, 3]);
  const { data } = await adminClient().from('drafts').select('version,paragraph_hashes').eq('essay_id', r.essayId).order('version');
  expect(data!.map((d) => d.version)).toEqual([1, 2, 3]);
  expect(data![1].paragraph_hashes[0]).toBe(data![0].paragraph_hashes[0]);
  expect(data![1].paragraph_hashes[1]).not.toBe(data![0].paragraph_hashes[1]);
});

test('saveDraft validates length and refuses another user essay', async () => {
  const r = await insertEssay(A.client, A.userId, input);
  if (!r.ok) throw new Error(r.error);
  expect(await insertDraft(A.client, A.userId, r.essayId, 'Too short.')).toEqual({ ok: false, error: 'Add a little more: feedback needs at least 50 words.' });
  expect(await insertDraft(B.client, B.userId, r.essayId, edited)).toEqual({ ok: false, error: "We couldn't find that essay." });
});

const draftOf = async (essayId: string) => (await adminClient().from('drafts').select('id').eq('essay_id', essayId).eq('version', 1).single()).data!.id;

test('createEssay saves the self-assessment with draft 1 when given and nothing when untouched', async () => {
  const self = { scores: [{ criterion: 'Thesis', score: 3 }, { criterion: 'Evidence', score: 2 }], weakness: 'My evidence is thin.' };
  const r = await insertEssay(A.client, A.userId, { ...input, selfAssessment: self });
  if (!r.ok) throw new Error(r.error);
  const draftId = await draftOf(r.essayId);
  expect((await A.client.from('self_assessments').select('scores,weakness').eq('draft_id', draftId).single()).data).toEqual(self);

  const plain = await insertEssay(A.client, A.userId, { ...input, selfAssessment: { scores: [], weakness: '' } });
  if (!plain.ok) throw new Error(plain.error);
  expect((await adminClient().from('self_assessments').select('draft_id').eq('draft_id', await draftOf(plain.essayId))).data).toEqual([]);
});

test('a score outside 1..maxScore is rejected at the server and nothing is saved', async () => {
  const before = (await adminClient().from('essays').select('id').eq('user_id', A.userId)).data!.length;
  const r = await insertEssay(A.client, A.userId, { ...input, selfAssessment: { scores: [{ criterion: 'Thesis', score: 9 }], weakness: null } });
  expect(r.ok).toBe(false);
  expect((await adminClient().from('essays').select('id').eq('user_id', A.userId)).data!.length).toBe(before);
});

test('createEssay saves timed_minutes and minutes_used; invalid durations are rejected', async () => {
  const r = await insertEssay(A.client, A.userId, { ...input, timedMinutes: 30, minutesUsed: 27 });
  if (!r.ok) throw new Error(r.error);
  expect((await adminClient().from('essays').select('timed_minutes').eq('id', r.essayId).single()).data!.timed_minutes).toBe(30);
  expect((await adminClient().from('drafts').select('minutes_used').eq('essay_id', r.essayId).single()).data!.minutes_used).toBe(27);
  expect((await insertEssay(A.client, A.userId, { ...input, timedMinutes: 25 as never, minutesUsed: 10 })).ok).toBe(false);
  expect((await insertEssay(A.client, A.userId, { ...input, timedMinutes: 20, minutesUsed: -1 })).ok).toBe(false);
});
