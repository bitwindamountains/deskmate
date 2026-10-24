import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { generateChunk } from '@/lib/generate/generate-chunk';
import { insertSource } from '@/lib/import/create-source';
import { AllProvidersFailedError, type complete } from '@/llm/router';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';
import { DAILY_GENERATIONS } from '@/lib/generate/limits';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/generate/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  // the route requires a finished onboarding (18+ attestation)
  const now = new Date().toISOString();
  const { error } = await adminClient().from('profiles')
    .upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
  if (error) throw error;
});
afterAll(async () => { await deleteTestUsers(created); });

const TEXT = 'Glycolysis happens in the cytoplasm and does not need oxygen. The Krebs cycle happens in the mitochondria. '.repeat(3);
const card = (source_quote: string) => ({
  type: 'basic', front: 'Where does glycolysis happen?', back: 'In the cytoplasm', key_points: ['cytoplasm'],
  source_quote, concept: 'glycolysis', bloom_level: 'remember', importance: 2,
});
const okLog = [{ task: 'card_generate', provider: 'groq', model: 'fake-model', status: 'ok', tokensIn: 10, tokensOut: 20, latencyMs: 5 }];
const okComplete = () => vi.fn(async () => ({
  data: { cards: [card('happens in the cytoplasm'), card('not in the text at all')] }, provider: 'groq', model: 'fake-model', log: okLog,
})) as unknown as typeof complete;
const failComplete = () => vi.fn(async () => {
  throw new AllProvidersFailedError('all failed', [{ ...okLog[0], status: 'rate_limited', message: 'provider says no' }] as never);
}) as unknown as typeof complete;

async function newSource(u: User, title = 'Bio') {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: title, title: 'Notes', kind: 'text', pages: [{ page: 1, text: TEXT }] });
  if (!r.ok) throw new Error(r.error);
  return r.sourceId;
}
const generations = async (userId: string) =>
  (await adminClient().from('quota_usage').select('generations').eq('user_id', userId).maybeSingle()).data?.generations ?? 0;

test('retry after busy does not consume quota twice', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const sourceId = await newSource(U);
  const first = await generateChunk(U.client, U.userId, sourceId, 0, {}, failComplete());
  expect(first).toMatchObject({ ok: false, status: 503, error: 'busy' });
  expect(await generations(U.userId)).toBe(1);
  const second = await generateChunk(U.client, U.userId, sourceId, 0, {}, okComplete());
  expect(second).toMatchObject({ ok: true, droppedUngrounded: 1, alreadyGenerated: false });
  if (second.ok) expect(second.cards).toHaveLength(1);
  expect(await generations(U.userId)).toBe(1);
  const { data: chunk } = await adminClient().from('source_chunks').select('generated_at').eq('source_id', sourceId).single();
  expect(chunk!.generated_at).not.toBeNull();
});

test('already generated chunk returns existing cards without an LLM call', async () => {
  const sourceId = await newSource(A);
  const first = await generateChunk(A.client, A.userId, sourceId, 0, {}, okComplete());
  expect(first.ok).toBe(true);
  const again = okComplete();
  const r = await generateChunk(A.client, A.userId, sourceId, 0, {}, again);
  expect(again).not.toHaveBeenCalled();
  expect(r).toMatchObject({ ok: true, alreadyGenerated: true, droppedUngrounded: 0 });
  if (r.ok && first.ok) {
    expect(r.cards.map((c) => c.id)).toEqual(first.cards.map((c) => c.id));
    expect(r.cards[0]).toMatchObject({ status: 'pending', page_start: 1, importance: 2 });
  }
});

test('another user sourceId gives 404 and no completeFn call', async () => {
  const sourceId = await newSource(B, 'Theirs');
  const fn = okComplete();
  const r = await generateChunk(A.client, A.userId, sourceId, 0, {}, fn);
  expect(r).toMatchObject({ ok: false, status: 404, error: 'not_found' });
  expect(fn).not.toHaveBeenCalled();
  const { data: src } = await adminClient().from('sources').select('quota_consumed_at').eq('id', sourceId).single();
  expect(src!.quota_consumed_at).toBeNull();
});

test('the daily limit in code matches the database: one source past DAILY_GENERATIONS gives 429', async () => {
  const U = await createTestUser(); created.push(U.userId);
  for (let i = 0; i < DAILY_GENERATIONS; i++) {
    const r = await generateChunk(U.client, U.userId, await newSource(U, `D${i}`), 0, {}, okComplete());
    expect(r.ok).toBe(true);
  }
  const fn = okComplete();
  const r = await generateChunk(U.client, U.userId, await newSource(U, 'D3'), 0, {}, fn);
  expect(r).toEqual({ ok: false, status: 429, error: 'quota', message: expect.stringMatching(/^You've used today's 3 card generations\. They reset in (about \d+ hours?|under an hour)\.$/) });
  expect(fn).not.toHaveBeenCalled();
});

test('llm_calls rows are written for success and failure', async () => {
  const U = await createTestUser(); created.push(U.userId);
  await generateChunk(U.client, U.userId, await newSource(U, 'F'), 0, {}, failComplete());
  await generateChunk(U.client, U.userId, await newSource(U, 'S'), 0, {}, okComplete());
  const { data } = await adminClient().from('llm_calls').select('task,provider,model,status,tokens_in,tokens_out,latency_ms').eq('user_id', U.userId);
  expect(data).toHaveLength(2);
  expect(data).toEqual(expect.arrayContaining([
    { task: 'card_generate', provider: 'groq', model: 'fake-model', status: 'rate_limited', tokens_in: 10, tokens_out: 20, latency_ms: 5 },
    { task: 'card_generate', provider: 'groq', model: 'fake-model', status: 'ok', tokens_in: 10, tokens_out: 20, latency_ms: 5 },
  ]));
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

test('POST with a non-uuid sourceId is 400', async () => {
  session.client = A.client;
  const res = await post({ sourceId: 'not-a-uuid', position: 0 });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'bad_request' });
});

test('POST without a session is 401', async () => {
  session.client = (await import('./helpers')).anonClient();
  const res = await post({ sourceId: crypto.randomUUID(), position: 0 });
  expect(res.status).toBe(401);
});

test('POST from a signed-in user who never onboarded is 403 not_onboarded', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const sourceId = await newSource(U);
  session.client = U.client;
  const res = await post({ sourceId, position: 0 });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'not_onboarded', message: 'Finish setting up your account first.' });
  expect(await generations(U.userId)).toBe(0);
});

test('POST for an unknown source is 404 with the error shape', async () => {
  session.client = A.client;
  const res = await post({ sourceId: crypto.randomUUID(), position: 0 });
  expect(res.status).toBe(404);
  expect(Object.keys(await res.json()).sort()).toEqual(['error', 'message']);
});
