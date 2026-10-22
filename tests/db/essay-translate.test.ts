import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { translateItem } from '@/lib/essay/translate';
import type { complete } from '@/llm/router';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/essays/translate/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

const log = (task: string) => [{ task, provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
type Fake = typeof complete & ReturnType<typeof vi.fn>;
const fake = () => vi.fn(async (task: string, prompt: { user: string }) => {
  const hints = (prompt.user.match(/^\d+\. /gm) ?? []).map((_, i) => `Pahiwatig ${i + 1}`);
  return { data: { summary: 'Kulang sa ebidensya', hints }, provider: 'groq', model: 'fake', log: log(task) };
}) as unknown as Fake;

async function newItem(u: User, highest = 0) {
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const draft = (await u.client.from('drafts')
    .insert({ user_id: u.userId, essay_id: essay, version: 1, content: 'Phones distract.\n\nThey do.', word_count: 4, paragraph_hashes: ['a', 'b'] }).select('id').single()).data!.id;
  const { data, error } = await adminClient().from('feedback_items').insert({ user_id: u.userId, draft_id: draft, layer: 'global',
    category: 'evidence', severity: 'high', summary: 'Claim lacks evidence', hints: ['What supports it?', 'Find a statistic.'], highest_level: highest, source: 'llm' })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  const { error } = await adminClient().from('profiles')
    .upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
  if (error) throw error;
});
afterAll(async () => { await deleteTestUsers(created); });

test('second request for the same item, language and level is cached with no LLM call', async () => {
  const id = await newItem(A, 1);
  const fn = fake();
  const first = await translateItem(A.client, A.userId, id, 'fil', {}, fn);
  expect(first).toEqual({ ok: true, summary: 'Kulang sa ebidensya', hints: ['Pahiwatig 1'], cached: false });
  const again = await translateItem(A.client, A.userId, id, 'fil', {}, fn);
  expect(again).toEqual({ ok: true, summary: 'Kulang sa ebidensya', hints: ['Pahiwatig 1'], cached: true });
  expect(fn).toHaveBeenCalledTimes(1);
  // only the hints revealed so far are sent
  expect((fn.mock.calls[0][1] as { user: string }).user).toContain('What supports it?');
  expect((fn.mock.calls[0][1] as { user: string }).user).not.toContain('Find a statistic.');
});

test('revealing a new hint level makes a new cache entry', async () => {
  const id = await newItem(A, 1);
  const fn = fake();
  await translateItem(A.client, A.userId, id, 'fil', {}, fn);
  await adminClient().from('feedback_items').update({ highest_level: 2 }).eq('id', id);
  const r = await translateItem(A.client, A.userId, id, 'fil', {}, fn);
  expect(r).toMatchObject({ ok: true, hints: ['Pahiwatig 1', 'Pahiwatig 2'], cached: false });
  expect(fn).toHaveBeenCalledTimes(2);
  expect((await adminClient().from('item_translations').select('level').eq('item_id', id)).data!.map((x) => x.level).sort()).toEqual([1, 2]);
});

test('another user item is 404 with no LLM call; helper limit reached is 429', async () => {
  const id = await newItem(A);
  const fn = fake();
  expect(await translateItem(B.client, B.userId, id, 'fil', {}, fn)).toMatchObject({ ok: false, status: 404 });
  const U = await createTestUser(); created.push(U.userId);
  const own = await newItem(U);
  await adminClient().from('quota_usage').upsert({ user_id: U.userId, day: new Date().toISOString().slice(0, 10), hints: 60 }, { onConflict: 'user_id,day' });
  expect(await translateItem(U.client, U.userId, own, 'es', {}, fn)).toMatchObject({ ok: false, status: 429 });
  expect(fn).not.toHaveBeenCalled();
});

test('POST validates the language and is 401 without a session', async () => {
  const req = (body: unknown) => new NextRequest('http://localhost/api/essays/translate', { method: 'POST', body: JSON.stringify(body) });
  session.client = A.client;
  expect((await POST(req({ itemId: crypto.randomUUID(), lang: 'de' }))).status).toBe(400);
  expect((await POST(req({ itemId: crypto.randomUUID(), lang: 'fil' }))).status).toBe(404);
  session.client = anonClient();
  expect((await POST(req({ itemId: crypto.randomUUID(), lang: 'fil' }))).status).toBe(401);
});
