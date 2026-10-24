import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { sendDialogue } from '@/lib/essay/dialogue';
import type { complete } from '@/llm/router';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/essays/dialogue/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

const ESSAY = 'Phones should be banned because they distract students.\n\nMany students check social media during lessons.';
const log = (task: string) => [{ task, provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
type Fake = typeof complete & ReturnType<typeof vi.fn>;
const fake = (data: Record<string, unknown>) =>
  vi.fn(async (task: string) => ({ data: { verdict: null, revised_summary: null, ...data }, provider: 'groq', model: 'fake', log: log(task) })) as unknown as Fake;

async function newItem(u: User) {
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const draft = (await u.client.from('drafts')
    .insert({ user_id: u.userId, essay_id: essay, version: 1, content: ESSAY, word_count: 15, paragraph_hashes: ['a', 'b'] }).select('id').single()).data!.id;
  const { data, error } = await adminClient().from('feedback_items').insert({ user_id: u.userId, draft_id: draft, layer: 'paragraph',
    category: 'evidence', paragraph_index: 0, quote: 'Phones should be banned', anchor_start: 0, anchor_end: 23,
    severity: 'high', summary: 'Claim lacks evidence', source: 'llm' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const item = async (id: string) => (await adminClient().from('feedback_items').select('status,dispute_reason,revised_summary').eq('id', id).single()).data!;
const messages = async (id: string) => (await adminClient().from('feedback_messages').select('role,kind,text,verdict').eq('item_id', id).order('created_at')).data!;
const setHints = (u: User, hints: number) => adminClient().from('quota_usage')
  .upsert({ user_id: u.userId, day: new Date().toISOString().slice(0, 10), hints }, { onConflict: 'user_id,day' });

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  const { error } = await adminClient().from('profiles')
    .upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
  if (error) throw error;
});
afterAll(async () => { await deleteTestUsers(created); });

test('a withdraw verdict sets the item withdrawn and logs both messages', async () => {
  const id = await newItem(A);
  const fn = fake({ reply: 'You are right: paragraph 2 gives the evidence.', verdict: 'withdraw' });
  const r = await sendDialogue(A.client, A.userId, id, 'dispute', 'Paragraph 2 is my evidence.', {}, fn);
  expect(r).toEqual({ ok: true, reply: 'You are right: paragraph 2 gives the evidence.', verdict: 'withdraw', revisedSummary: null });
  expect((await item(id)).status).toBe('withdrawn');
  expect(await messages(id)).toEqual([
    { role: 'student', kind: 'dispute', text: 'Paragraph 2 is my evidence.', verdict: null },
    { role: 'coach', kind: 'dispute', text: 'You are right: paragraph 2 gives the evidence.', verdict: 'withdraw' },
  ]);
});

test('a modify verdict stores the revised summary through revise_item and marks the item disputed', async () => {
  const id = await newItem(A);
  const r = await sendDialogue(A.client, A.userId, id, 'dispute', 'I do cite a source.', {},
    fake({ reply: 'Partly. The source is there but not explained.', verdict: 'modify', revised_summary: 'Explain how your source supports the claim.' }));
  expect(r).toMatchObject({ ok: true, verdict: 'modify', revisedSummary: 'Explain how your source supports the claim.' });
  expect(await item(id)).toEqual({ status: 'disputed', dispute_reason: 'I do cite a source.', revised_summary: 'Explain how your source supports the claim.' });
});

test('a question never changes the item, even if the model returns a verdict', async () => {
  const id = await newItem(A);
  const r = await sendDialogue(A.client, A.userId, id, 'question', 'What counts as evidence?', {},
    fake({ reply: 'A fact, a statistic, or a source.', verdict: 'withdraw' }));
  expect(r).toMatchObject({ ok: true, verdict: null });
  expect(await item(id)).toEqual({ status: 'open', dispute_reason: null, revised_summary: null });
  expect((await messages(id)).map((m) => m.kind)).toEqual(['question', 'question']);
});

test('replies over 120 words are cut at a sentence boundary before saving', async () => {
  const id = await newItem(A);
  const sentence = 'This sentence has exactly ten words in it for counting. ';
  const r = await sendDialogue(A.client, A.userId, id, 'question', 'Why?', {}, fake({ reply: sentence.repeat(13) }));
  expect(r.ok && r.reply).toBe(sentence.repeat(12).trim());
  expect((await messages(id))[1].text).toBe(sentence.repeat(12).trim());
});

test('the fifth coach reply is 409 with the limit copy and no LLM call', async () => {
  const id = await newItem(A);
  await adminClient().from('feedback_messages').insert(Array.from({ length: 4 }, () =>
    ({ user_id: A.userId, item_id: id, role: 'coach', kind: 'question', text: 'Answer.' })));
  const fn = fake({ reply: 'x' });
  expect(await sendDialogue(A.client, A.userId, id, 'question', 'One more?', {}, fn)).toEqual({ ok: false, status: 409,
    message: "That's as far as I can take this one. Try the hint ladder, or mark it Got it." });
  expect(fn).not.toHaveBeenCalled();
});

test('another user item is 404 with no LLM call; helper limit reached is 429', async () => {
  const id = await newItem(A);
  const fn = fake({ reply: 'x' });
  expect(await sendDialogue(B.client, B.userId, id, 'question', 'Hi?', {}, fn)).toMatchObject({ ok: false, status: 404 });
  expect(fn).not.toHaveBeenCalled();
  const U = await createTestUser(); created.push(U.userId);
  const own = await newItem(U);
  await setHints(U, 60);
  expect(await sendDialogue(U.client, U.userId, own, 'question', 'Hi?', {}, fn)).toEqual({ ok: false, status: 429,
    message: expect.stringMatching(/^You've asked for a lot of help today\. More unlocks in (about \d+ hours?|under an hour)\.$/) });
  expect(fn).not.toHaveBeenCalled();
});

test('POST validates the body and is 401 without a session', async () => {
  const req = (body: unknown) => new NextRequest('http://localhost/api/essays/dialogue', { method: 'POST', body: JSON.stringify(body) });
  session.client = A.client;
  expect((await POST(req({ itemId: 'nope', kind: 'question', message: 'Hi' }))).status).toBe(400);
  expect((await POST(req({ itemId: crypto.randomUUID(), kind: 'shout', message: 'Hi' }))).status).toBe(400);
  expect((await POST(req({ itemId: crypto.randomUUID(), kind: 'question', message: 'x'.repeat(1001) }))).status).toBe(400);
  expect((await POST(req({ itemId: crypto.randomUUID(), kind: 'question', message: 'Hi' }))).status).toBe(404);
  session.client = (await import('./helpers')).anonClient();
  expect((await POST(req({ itemId: crypto.randomUUID(), kind: 'question', message: 'Hi' }))).status).toBe(401);
});

test('a follow-up on a revised item sends the revised summary to the model', async () => {
  const id = await newItem(A);
  await adminClient().from('feedback_items').update({ revised_summary: 'Explain how your source supports the claim.' }).eq('id', id);
  const fn = fake({ reply: 'Sure.' });
  await sendDialogue(A.client, A.userId, id, 'question', 'How?', {}, fn);
  const user = (fn.mock.calls[0][1] as { user: string }).user;
  expect(user).toContain('Explain how your source supports the claim.');
  expect(user).not.toContain('Claim lacks evidence');
});
