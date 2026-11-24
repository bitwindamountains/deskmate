import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { gradeWithLlm } from '@/lib/grade/grade-with-llm';
import { AllProvidersFailedError, type complete } from '@/llm/router';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/grade/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
let aCard: string;
let bCard: string;

async function makeCard(u: User): Promise<string> {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Deck', title: 'Notes', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(40) }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  const { data, error } = await admin.from('cards').insert({
    user_id: u.userId, deck_id: src!.deck_id, source_chunk_id: chunk!.id, type: 'why', front: 'Why does ATP synthase spin?',
    back: 'Protons flow down their gradient through it', key_points: ['proton gradient'], source_quote: 'q', concept: 'c',
    bloom_level: 'understand', importance: 2, status: 'kept',
  }).select('id').single();
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
  aCard = await makeCard(A);
  bCard = await makeCard(B);
});
afterAll(async () => { await deleteTestUsers(created); });

const grade = { score: 0.8, hit: ['proton gradient'], missed: [], misconception: null, feedback: 'Nice.', suggested_rating: 'good' };
const okLog = [{ task: 'grade_answer', provider: 'groq', model: 'fake-model', status: 'ok', tokensIn: 10, tokensOut: 20, latencyMs: 5 }];
const okComplete = () => vi.fn(async () => ({ data: grade, provider: 'groq', model: 'fake-model', log: okLog })) as unknown as typeof complete;
const failComplete = () => vi.fn(async () => {
  throw new AllProvidersFailedError('all failed', [{ ...okLog[0], status: 'rate_limited', message: 'no' }] as never);
}) as unknown as typeof complete;
const calls = async (userId: string) => (await adminClient().from('llm_calls').select('task,status').eq('user_id', userId)).data!;

test('second identical answer is served from cache with no LLM call', async () => {
  const first = okComplete();
  expect(await gradeWithLlm(A.client, A.userId, aCard, 'Protons flow through it', {}, first))
    .toEqual({ ok: true, result: grade, cached: false });
  expect(first).toHaveBeenCalledOnce();
  const second = okComplete();
  expect(await gradeWithLlm(A.client, A.userId, aCard, 'Protons flow through it', {}, second))
    .toEqual({ ok: true, result: grade, cached: true });
  expect(second).not.toHaveBeenCalled();
  expect(await calls(A.userId)).toEqual([{ task: 'grade_answer', status: 'ok' }]);
});

test('answers differing only in case and punctuation share a cache entry', async () => {
  const fn = okComplete();
  expect(await gradeWithLlm(A.client, A.userId, aCard, 'PROTONS flow through it!', {}, fn)).toMatchObject({ ok: true, cached: true });
  expect(fn).not.toHaveBeenCalled();
});

test('another user card is 404 with no LLM call', async () => {
  const fn = okComplete();
  expect(await gradeWithLlm(A.client, A.userId, bCard, 'anything', {}, fn)).toEqual({ ok: false, status: 404 });
  expect(fn).not.toHaveBeenCalled();
});

test('AllProvidersFailedError gives 503 and logs calls', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const card = await makeCard(U);
  expect(await gradeWithLlm(U.client, U.userId, card, 'no idea', {}, failComplete())).toEqual({ ok: false, status: 503 });
  expect(await calls(U.userId)).toEqual([{ task: 'grade_answer', status: 'rate_limited' }]);
  const { data } = await adminClient().from('grade_cache').select('card_id').eq('card_id', card);
  expect(data).toEqual([]);
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/grade', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

test('answer over 2000 chars is 400', async () => {
  session.client = A.client;
  const res = await post({ cardId: aCard, answer: 'x'.repeat(2001) });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'bad_request' });
});

test('POST without a session is 401', async () => {
  session.client = anonClient();
  expect((await post({ cardId: aCard, answer: 'x' })).status).toBe(401);
});

test('POST returns the cached grade', async () => {
  session.client = A.client;
  const res = await post({ cardId: aCard, answer: 'protons flow through it' });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ result: grade, cached: true });
});

test('POST for another user card is 404 with the error shape', async () => {
  session.client = A.client;
  const res = await post({ cardId: bCard, answer: 'x' });
  expect(res.status).toBe(404);
  expect(Object.keys(await res.json()).sort()).toEqual(['error', 'message']);
});

test('consume_grade_quota allows 300 new grades a day, then refuses, and users cannot reset it', async () => {
  const U = await createTestUser(); created.push(U.userId);
  await adminClient().from('quota_usage').insert({ user_id: U.userId, day: new Date().toISOString().slice(0, 10), grades: 299 });
  const take = () => U.client.rpc('consume_grade_quota');
  expect((await take()).data).toBe(true);
  expect((await take()).data).toBe(false);
  expect((await U.client.from('quota_usage').select('grades').single()).data?.grades).toBe(300);
  await U.client.from('quota_usage').update({ grades: 0 }).eq('user_id', U.userId);
  expect((await take()).data).toBe(false);
  expect((await anonClient().rpc('consume_grade_quota')).error).not.toBeNull();
});

test('at the daily cap, a new answer is refused with no LLM call, but a cached one is still served', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const { error } = await adminClient().from('quota_usage').upsert({ user_id: A.userId, day, grades: 300 }, { onConflict: 'user_id,day' });
  if (error) throw error;
  const fn = okComplete();
  expect(await gradeWithLlm(A.client, A.userId, aCard, 'a brand new answer', {}, fn)).toEqual({ ok: false, status: 429 });
  expect(fn).not.toHaveBeenCalled();
  expect(await gradeWithLlm(A.client, A.userId, aCard, 'Protons flow through it', {}, fn)).toMatchObject({ ok: true, cached: true });
  session.client = A.client;
  const res = await post({ cardId: aCard, answer: 'another new answer' });
  expect(res.status).toBe(429);
  expect(await res.json()).toMatchObject({ error: 'grade_limit' });
});
