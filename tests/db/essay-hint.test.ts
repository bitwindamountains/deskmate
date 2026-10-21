import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { requestHint } from '@/lib/essay/hints';
import { AllProvidersFailedError, type complete } from '@/llm/router';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/essays/hint/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

const ESSAY = 'Phones should be banned because they distract students.\n\nMany students check social media during lessons.';
const log = (task: string) => [{ task, provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
type Fake = typeof complete & ReturnType<typeof vi.fn>;
const fake = (data: unknown) => vi.fn(async (task: string) => ({ data, provider: 'groq', model: 'fake', log: log(task) })) as unknown as Fake;
const ladder = () => fake({ explanation: 'Claims need support.', example: 'Bees matter because they pollinate crops; without them, yields fall.' });
const rewrite = (text = 'Phones distract students, so schools should ban them.') => fake({ rewrite: text });

async function newDraft(u: User) {
  const essay = (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const { data, error } = await u.client.from('drafts')
    .insert({ user_id: u.userId, essay_id: essay, version: 1, content: ESSAY, word_count: 15, paragraph_hashes: ['a', 'b'] }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
async function newItem(u: User, draftId: string, quote: string | null = 'Phones should be banned') {
  // fixture: admin insert; users may add items only to a paid draft (tested in essays.test.ts)
  const { data, error } = await adminClient().from('feedback_items').insert({
    user_id: u.userId, draft_id: draftId, layer: quote ? 'paragraph' : 'global', category: 'evidence', paragraph_index: quote ? 0 : null,
    quote, anchor_start: quote ? 0 : null, anchor_end: quote ? quote.length : null,
    severity: 'high', summary: 'Claim lacks evidence', hints: ['What supports this?', 'Look for a statistic.'], source: 'llm',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const row = async (id: string) => (await adminClient().from('feedback_items').select('hints,rewrite,highest_level').eq('id', id).single()).data!;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  const { error } = await adminClient().from('profiles')
    .upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
  if (error) throw error;
});
afterAll(async () => { await deleteTestUsers(created); });

test('level 3 then level 4 makes one LLM call total', async () => {
  const item = await newItem(A, await newDraft(A));
  const fn = ladder();
  expect(await requestHint(A.client, A.userId, item, 3, {}, fn)).toEqual({ ok: true, text: 'Claims need support.' });
  expect(await requestHint(A.client, A.userId, item, 4, {}, fn)).toEqual({ ok: true, text: 'Bees matter because they pollinate crops; without them, yields fall.' });
  expect(fn).toHaveBeenCalledOnce();
  expect(fn.mock.calls[0][0]).toBe('hint_ladder');
  expect((await row(item)).hints).toHaveLength(4);
});

test('another user item is 404 with no LLM call', async () => {
  const item = await newItem(B, await newDraft(B));
  const fn = ladder();
  expect(await requestHint(A.client, A.userId, item, 3, {}, fn)).toMatchObject({ ok: false, status: 404 });
  expect(fn).not.toHaveBeenCalled();
});

test('fourth rewrite on a draft is 429 with no LLM call', async () => {
  const draft = await newDraft(A);
  for (let i = 0; i < 3; i++) {
    const r = await requestHint(A.client, A.userId, await newItem(A, draft), 5, {}, rewrite());
    expect(r.ok).toBe(true);
  }
  const fn = rewrite();
  expect(await requestHint(A.client, A.userId, await newItem(A, draft), 5, {}, fn))
    .toEqual({ ok: false, status: 429, message: "You've used this draft's 3 suggested rewrites." });
  expect(fn).not.toHaveBeenCalled();
});

test('a saved rewrite is returned again without a new reservation', async () => {
  const draft = await newDraft(A);
  const item = await newItem(A, draft);
  await requestHint(A.client, A.userId, item, 5, {}, rewrite());
  const fn = rewrite('other');
  expect(await requestHint(A.client, A.userId, item, 5, {}, fn)).toEqual({ ok: true, text: 'Phones distract students, so schools should ban them.' });
  expect(fn).not.toHaveBeenCalled();
});

test('rewrite longer than the cap is discarded and reported', async () => {
  const item = await newItem(A, await newDraft(A)); // quote is 4 words, so the cap is 25 words
  const long = Array.from({ length: 26 }, (_, i) => `word${i}`).join(' ');
  expect(await requestHint(A.client, A.userId, item, 5, {}, rewrite(long)))
    .toEqual({ ok: false, status: 503, message: "Couldn't make a suggestion for this one." });
  expect((await row(item)).rewrite).toBeNull();
});

test('global item rewrite is 409 with the whole-essay message', async () => {
  const item = await newItem(A, await newDraft(A), null);
  const fn = rewrite();
  expect(await requestHint(A.client, A.userId, item, 5, {}, fn))
    .toEqual({ ok: false, status: 409, message: "This item covers the whole essay, so there's no single sentence to rewrite." });
  expect(fn).not.toHaveBeenCalled();
});

test('highest_level rises and a viewed_level event is stored', async () => {
  const item = await newItem(A, await newDraft(A));
  await requestHint(A.client, A.userId, item, 4, {}, ladder());
  expect((await row(item)).highest_level).toBe(4);
  await requestHint(A.client, A.userId, item, 3, {}, ladder());
  expect((await row(item)).highest_level).toBe(4);
  const events = (await adminClient().from('feedback_events').select('action,level').eq('item_id', item)).data!;
  expect(events).toEqual(expect.arrayContaining([{ action: 'viewed_level', level: 4 }, { action: 'viewed_level', level: 3 }]));
});

test('providers busy is 503 and the call is logged', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const item = await newItem(U, await newDraft(U));
  const fn = vi.fn(async () => { throw new AllProvidersFailedError('x', [{ ...log('hint_ladder')[0], status: 'rate_limited' }] as never); }) as unknown as Fake;
  expect(await requestHint(U.client, U.userId, item, 3, {}, fn)).toEqual({ ok: false, status: 503, message: 'Hints are busy right now. Try again in a minute.' });
  expect((await adminClient().from('llm_calls').select('task,status').eq('user_id', U.userId)).data).toEqual([{ task: 'hint_ladder', status: 'rate_limited' }]);
});

test('daily hint limit reached is 429 with no LLM call and no rewrite slot used', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const item = await newItem(U, await newDraft(U));
  await adminClient().from('quota_usage').insert({ user_id: U.userId, day: new Date().toISOString().slice(0, 10), hints: 60 });
  const fn = ladder();
  const limit = { ok: false, status: 429, message: "You've asked for a lot of hints today. More unlock at midnight UTC." };
  expect(await requestHint(U.client, U.userId, item, 3, {}, fn)).toEqual(limit);
  expect(await requestHint(U.client, U.userId, item, 5, {}, rewrite())).toEqual(limit);
  expect(fn).not.toHaveBeenCalled();
  expect((await adminClient().from('feedback_events').select('id').eq('item_id', item).eq('action', 'rewrite')).data).toEqual([]);
});

test('a stored hint costs nothing from the daily limit', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const item = await newItem(U, await newDraft(U));
  await requestHint(U.client, U.userId, item, 3, {}, ladder());
  await requestHint(U.client, U.userId, item, 4, {}, ladder());
  expect((await adminClient().from('quota_usage').select('hints').eq('user_id', U.userId).single()).data?.hints).toBe(1);
});

test('no rewrite for an item whose words were deleted: clear message, no LLM call, no slot used', async () => {
  const draft = await newDraft(A);
  const item = await newItem(A, draft);
  await adminClient().from('feedback_items').update({ anchor_start: null, anchor_end: null, paragraph_index: null }).eq('id', item); // carried over, words gone
  const fn = rewrite();
  expect(await requestHint(A.client, A.userId, item, 5, {}, fn))
    .toEqual({ ok: false, status: 409, message: "The words this item pointed to are no longer in your essay, so there's nothing to rewrite." });
  expect(fn).not.toHaveBeenCalled();
  expect((await adminClient().from('feedback_events').select('id').eq('item_id', item).eq('action', 'rewrite')).data).toEqual([]);
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/essays/hint', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

test('POST validates level and session', async () => {
  session.client = A.client;
  expect((await post({ itemId: crypto.randomUUID(), level: 2 })).status).toBe(400);
  const res = await post({ itemId: crypto.randomUUID(), level: 3 });
  expect(res.status).toBe(404);
  expect(Object.keys(await res.json()).sort()).toEqual(['error', 'message']);
  session.client = anonClient();
  expect((await post({ itemId: crypto.randomUUID(), level: 3 })).status).toBe(401);
});
