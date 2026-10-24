import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { requestRephrase } from '@/lib/cards/rephrase';
import type { complete } from '@/llm/router';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

async function makeCard(u: User, back = 'In the cytoplasm'): Promise<string> {
  const deck = (await u.client.from('decks').insert({ user_id: u.userId, title: 'Bio' }).select('id').single()).data!.id;
  const { data, error } = await adminClient().from('cards').insert({ user_id: u.userId, deck_id: deck, source_chunk_id: null, type: 'basic',
    front: 'Where does glycolysis happen?', back, key_points: [], source_quote: '', concept: 'glycolysis', bloom_level: 'remember',
    importance: 2, status: 'kept' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const log = [{ task: 'card_rephrase', provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
const fake = (question: string) => vi.fn(async () => ({ data: { question }, provider: 'groq', model: 'fake', log })) as unknown as typeof complete & ReturnType<typeof vi.fn>;
const hints = async (u: User) => (await adminClient().from('quota_usage').select('hints').eq('user_id', u.userId).maybeSingle()).data?.hints ?? 0;

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

test('a rewording is saved on the card and reused: one helper call, then free (B3.1)', async () => {
  const card = await makeCard(A);
  const before = await hints(A);
  expect(await requestRephrase(A.client, A.userId, card, {}, fake('In which part of the cell does glycolysis take place?')))
    .toEqual({ ok: true, question: 'In which part of the cell does glycolysis take place?', cached: false });
  const again = fake('unused');
  expect(await requestRephrase(A.client, A.userId, card, {}, again)).toMatchObject({ ok: true, cached: true });
  expect(again).not.toHaveBeenCalled();
  expect(await hints(A)).toBe(before + 1);
});

test('the same question, a leaked short answer or cloze markup is not offered; another student card is not found', async () => {
  const unusable = { ok: false, status: 422, message: "We couldn't find a fair way to reword this one. Try the card as it is." };
  expect(await requestRephrase(A.client, A.userId, await makeCard(A), {}, fake('Where does glycolysis happen?'))).toEqual(unusable);
  expect(await requestRephrase(A.client, A.userId, await makeCard(A), {}, fake('Glycolysis happens in the cytoplasm: true?'))).toEqual(unusable);
  expect(await requestRephrase(A.client, A.userId, await makeCard(A), {}, fake('{{c1::Glycolysis}} happens where?'))).toEqual(unusable);
  const fn = fake('x?');
  expect(await requestRephrase(A.client, A.userId, await makeCard(B), {}, fn)).toEqual({ ok: false, status: 404, message: "We couldn't find that card." });
  expect(fn).not.toHaveBeenCalled();
});
