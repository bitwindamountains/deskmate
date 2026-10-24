import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { requestCardImprove } from '@/lib/cards/improve';
import type { complete } from '@/llm/router';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/cards/improve/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
const TEXT = 'Glycolysis happens in the cytoplasm and does not need oxygen. It splits glucose into two pyruvate molecules. '
  + 'The pyruvate then enters the mitochondria, where the Krebs cycle releases carbon dioxide. Most ATP is made later, by the electron transport chain.';

async function makeCard(u: User, withSource = true): Promise<string> {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Bio', title: 'Notes', kind: 'text', pages: [{ page: 1, text: TEXT }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  const { data, error } = await admin.from('cards').insert({
    user_id: u.userId, deck_id: src!.deck_id, source_chunk_id: withSource ? chunk!.id : null, type: 'basic',
    front: 'Glycolysis?', back: 'It is the thing in the cytoplasm that splits glucose into two pyruvate and needs no oxygen', key_points: [],
    source_quote: withSource ? 'happens in the cytoplasm' : '', concept: 'glycolysis', bloom_level: 'remember', importance: 3, status: 'pending',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

const log = [{ task: 'card_improve', provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
const fake = (source_quote: string) => vi.fn(async () => ({
  data: { front: 'Where in the cell does glycolysis happen?', back: 'In the cytoplasm', source_quote }, provider: 'groq', model: 'fake', log,
})) as unknown as typeof complete & ReturnType<typeof vi.fn>;
const hintsUsed = async (u: User) => (await adminClient().from('quota_usage').select('hints').eq('user_id', u.userId).maybeSingle()).data?.hints ?? 0;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  await adminClient().from('profiles').upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
});
afterAll(async () => { await deleteTestUsers(created); });

test('a grounded rewrite comes back as a suggestion, the card is untouched, and one helper call is used', async () => {
  const card = await makeCard(A);
  const before = await hintsUsed(A);
  expect(await requestCardImprove(A.client, A.userId, card, {}, fake('happens in the cytoplasm')))
    .toEqual({ ok: true, suggestion: { front: 'Where in the cell does glycolysis happen?', back: 'In the cytoplasm' } });
  expect(await hintsUsed(A)).toBe(before + 1);
  expect((await adminClient().from('cards').select('front').eq('id', card).single()).data!.front).toBe('Glycolysis?');
});

test('an ungrounded rewrite is not offered', async () => {
  const card = await makeCard(A);
  expect(await requestCardImprove(A.client, A.userId, card, {}, fake('made up by the model')))
    .toEqual({ ok: false, status: 422, message: "We couldn't improve this card without changing what it says. Edit it yourself instead." });
});

test('a rewrite that turns a basic card into cloze markup is not offered', async () => {
  const card = await makeCard(A);
  const cloze = vi.fn(async () => ({ data: { front: '{{c1::Glycolysis}} happens in the cytoplasm.', back: 'Glycolysis', source_quote: 'happens in the cytoplasm' },
    provider: 'groq', model: 'fake', log })) as unknown as typeof complete;
  expect(await requestCardImprove(A.client, A.userId, card, {}, cloze)).toMatchObject({ ok: false, status: 422 });
});

test('a hand-written card with no source passage, or another student card, never reaches the AI', async () => {
  const handWritten = await makeCard(A, false);
  const fn = fake('happens in the cytoplasm');
  expect(await requestCardImprove(A.client, A.userId, handWritten, {}, fn))
    .toEqual({ ok: false, status: 409, message: "This card has no source passage to check a rewrite against. Edit it yourself instead." });
  const theirs = await makeCard(B);
  expect(await requestCardImprove(A.client, A.userId, theirs, {}, fn)).toEqual({ ok: false, status: 404, message: "We couldn't find that card." });
  expect(fn).not.toHaveBeenCalled();
});

test('the route checks the body and the session', async () => {
  session.client = A.client;
  const post = (body: unknown) => POST(new NextRequest('http://x/api/cards/improve', { method: 'POST', body: JSON.stringify(body) }));
  expect((await post({ cardId: 'nope' })).status).toBe(400);
  session.client = (await import('./helpers')).anonClient();
  expect((await post({ cardId: crypto.randomUUID() })).status).toBe(401);
});
