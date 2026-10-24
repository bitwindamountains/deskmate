import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { requestCardHelp } from '@/lib/cards/help';
import type { complete } from '@/llm/router';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/cards/help/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
const TEXT = 'Glycolysis happens in the cytoplasm and does not need oxygen. It splits glucose into two pyruvate molecules. '
  + 'The pyruvate then enters the mitochondria, where the Krebs cycle releases carbon dioxide. Most ATP is made later, by the electron transport chain.';

async function makeCard(u: User): Promise<{ id: string; deck: string }> {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Bio', title: 'Notes', kind: 'text', pages: [{ page: 1, text: TEXT }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  const { data, error } = await admin.from('cards').insert({
    user_id: u.userId, deck_id: src!.deck_id, source_chunk_id: chunk!.id, type: 'basic', front: 'What is glycolysis?',
    back: 'Splitting glucose into pyruvate in the cytoplasm, without oxygen', key_points: ['cytoplasm', 'pyruvate', 'no oxygen'],
    source_quote: 'happens in the cytoplasm', concept: 'glycolysis', bloom_level: 'understand', importance: 3, status: 'kept',
  }).select('id').single();
  if (error) throw error;
  return { id: data.id as string, deck: src!.deck_id as string };
}

const split = (front: string, source_quote: string) =>
  ({ type: 'basic', front, back: 'b', key_points: [], source_quote, concept: 'glycolysis', bloom_level: 'remember' });
const HELP = {
  explanation: 'Think of glycolysis as the first cut: one glucose becomes two pyruvate.', mnemonic: 'Glyco-LYSIS = sugar SPLITTING.',
  analogy: 'Like snapping a chocolate bar in half before sharing it.',
  split: [split('Where does glycolysis happen?', 'happens in the cytoplasm'), split('What does glycolysis make?', 'two pyruvate molecules'),
    split('Who discovered glycolysis?', 'Embden and Meyerhof in 1940')],
};
const log = [{ task: 'card_help', provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
const fake = () => vi.fn(async () => ({ data: HELP, provider: 'groq', model: 'fake', log })) as unknown as typeof complete & ReturnType<typeof vi.fn>;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  await adminClient().from('profiles').upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
});
afterAll(async () => { await deleteTestUsers(created); });

test('ungrounded split cards are dropped and counted; grounded ones are saved pending in the same deck', async () => {
  const card = await makeCard(A);
  const r = await requestCardHelp(A.client, A.userId, card.id, {}, fake());
  expect(r).toEqual({ ok: true, help: { explanation: HELP.explanation, mnemonic: HELP.mnemonic, analogy: HELP.analogy }, added: 2, dropped: 1, cached: false });
  const added = (await adminClient().from('cards').select('front,status,deck_id,importance').eq('deck_id', card.deck).eq('status', 'pending')).data!;
  expect(added.map((c) => c.front).sort()).toEqual(['What does glycolysis make?', 'Where does glycolysis happen?']);
  expect(added.every((c) => c.importance === 3)).toBe(true);
});

test('second request is served from card_aids with no LLM call', async () => {
  const card = await makeCard(A);
  await requestCardHelp(A.client, A.userId, card.id, {}, fake());
  const again = fake();
  expect(await requestCardHelp(A.client, A.userId, card.id, {}, again)).toMatchObject({ ok: true, cached: true, added: 0, help: { mnemonic: HELP.mnemonic } });
  expect(again).not.toHaveBeenCalled();
});

test('daily helper limit reached is 429 with no LLM call', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const card = await makeCard(U);
  await adminClient().from('quota_usage').insert({ user_id: U.userId, day: new Date().toISOString().slice(0, 10), hints: 60 });
  const fn = fake();
  expect(await requestCardHelp(U.client, U.userId, card.id, {}, fn))
    .toEqual({ ok: false, status: 429, message: expect.stringMatching(/^You've asked for a lot of help today\. More unlocks in (about \d+ hours?|under an hour)\.$/) });
  expect(fn).not.toHaveBeenCalled();
});

test('another user card is 404 with no LLM call', async () => {
  const card = await makeCard(B);
  const fn = fake();
  expect(await requestCardHelp(A.client, A.userId, card.id, {}, fn)).toMatchObject({ ok: false, status: 404 });
  expect(fn).not.toHaveBeenCalled();
});

test('editing a card makes its cached help stale, so the next request asks again', async () => {
  const card = await makeCard(A);
  await requestCardHelp(A.client, A.userId, card.id, {}, fake());
  await adminClient().from('cards').update({ back: 'Glucose becomes two pyruvate, in the cytoplasm' }).eq('id', card.id);
  const again = fake();
  expect(await requestCardHelp(A.client, A.userId, card.id, {}, again)).toMatchObject({ ok: true, cached: false });
  expect(again).toHaveBeenCalledOnce();
  const third = fake();
  expect(await requestCardHelp(A.client, A.userId, card.id, {}, third)).toMatchObject({ ok: true, cached: true });
  expect(third).not.toHaveBeenCalled();
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/cards/help', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

test('POST validates the card id and the session', async () => {
  session.client = A.client;
  expect((await post({ cardId: 'nope' })).status).toBe(400);
  const res = await post({ cardId: crypto.randomUUID() });
  expect(res.status).toBe(404);
  expect(Object.keys(await res.json()).sort()).toEqual(['error', 'message']);
  session.client = anonClient();
  expect((await post({ cardId: crypto.randomUUID() })).status).toBe(401);
});
