import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { requestFeynman } from '@/lib/cards/feynman';
import { insertSource } from '@/lib/import/create-source';
import type { complete } from '@/llm/router';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];
const TEXT = 'Glycolysis happens in the cytoplasm and does not need oxygen. It splits glucose into two pyruvate molecules. '
  + 'The pyruvate then enters the mitochondria, where the Krebs cycle releases carbon dioxide. Most ATP is made later, by the electron transport chain.';
const words = (n: number) => Array.from({ length: n }, () => 'glycolysis').join(' ');

async function deckWithCard(u: User): Promise<string> {
  const r = await insertSource(u.client, u.userId, { newDeckTitle: 'Bio', title: 'Notes', kind: 'text', pages: [{ page: 1, text: TEXT }] });
  if (!r.ok) throw new Error(r.error);
  const admin = adminClient();
  const { data: src } = await admin.from('sources').select('deck_id').eq('id', r.sourceId).single();
  const { data: chunk } = await admin.from('source_chunks').select('id').eq('source_id', r.sourceId).single();
  await admin.from('cards').insert({ user_id: u.userId, deck_id: src!.deck_id, source_chunk_id: chunk!.id, type: 'basic', front: 'Where does glycolysis happen?',
    back: 'In the cytoplasm', key_points: ['cytoplasm'], source_quote: 'happens in the cytoplasm', concept: 'Glycolysis', bloom_level: 'remember',
    importance: 3, status: 'kept' });
  return src!.deck_id as string;
}
const card = (front: string, source_quote: string) => ({ type: 'basic', front, back: 'b', key_points: [], source_quote, concept: 'Glycolysis', bloom_level: 'remember' });
const log = [{ task: 'feynman', provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
const fake = () => vi.fn(async () => ({ data: { covered: ['cytoplasm'], missed: ['two pyruvate'], misconception: null,
  cards: [card('What does glycolysis make?', 'It splits glucose into two pyruvate molecules.'), card('Who found it?', 'Embden in 1940')] },
  provider: 'groq', model: 'fake', log })) as unknown as typeof complete & ReturnType<typeof vi.fn>;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

test('feedback comes back; grounded cards for missed points are saved pending with their passage, ungrounded ones dropped (B3.7)', async () => {
  const deck = await deckWithCard(A);
  const fn = fake();
  const r = await requestFeynman(A.client, A.userId, { deckId: deck, concept: 'glycolysis', explanation: words(25) }, {}, fn);
  expect(r).toEqual({ ok: true, feedback: { covered: ['cytoplasm'], missed: ['two pyruvate'], misconception: null, added: 1, dropped: 1 } });
  const user = ((fn.mock.calls[0] as unknown[])[1] as { user: string }).user;
  expect(user).toContain('<passages>');
  expect(user).toContain('Q: Where does glycolysis happen?');
  const pending = (await adminClient().from('cards').select('front,status,source_chunk_id').eq('deck_id', deck).eq('status', 'pending')).data!;
  expect(pending.map((c) => c.front)).toEqual(['What does glycolysis make?']);
  expect(pending[0].source_chunk_id).not.toBeNull();
});

test('too short, an unknown concept or another student deck never reach the AI', async () => {
  const deck = await deckWithCard(A);
  const fn = fake();
  expect(await requestFeynman(A.client, A.userId, { deckId: deck, concept: 'glycolysis', explanation: words(5) }, {}, fn))
    .toEqual({ ok: false, status: 400, message: 'Explain it in 20 to 600 words.' });
  expect(await requestFeynman(A.client, A.userId, { deckId: deck, concept: 'photosynthesis', explanation: words(25) }, {}, fn)).toMatchObject({ ok: false, status: 404 });
  const theirs = await deckWithCard(B);
  expect(await requestFeynman(A.client, A.userId, { deckId: theirs, concept: 'glycolysis', explanation: words(25) }, {}, fn)).toMatchObject({ ok: false, status: 404 });
  expect(fn).not.toHaveBeenCalled();
});
