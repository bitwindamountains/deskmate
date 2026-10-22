import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadStudy } from '@/lib/review/load';
import { startOfLocalDay } from '@/lib/time/zone';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

let A: { client: Client; userId: string };
const created: string[] = [];
beforeAll(async () => { A = await createTestUser(); created.push(A.userId); });
afterAll(async () => { await deleteTestUsers(created); });

test('new cards started today are counted from the student local midnight', async () => {
  const admin = adminClient();
  const deck = (await admin.from('decks').insert({ user_id: A.userId, title: 'D' }).select('id').single()).data!.id;
  const card = { user_id: A.userId, deck_id: deck, type: 'basic', front: 'F', back: 'B', source_quote: 'q', concept: 'c', bloom_level: 'remember', importance: 2, status: 'kept' };
  const [before, after] = (await admin.from('cards').insert([card, card]).select('id')).data!.map((c) => c.id);
  const midnight = startOfLocalDay(new Date(), 'Asia/Manila').getTime();
  const review = (id: string, at: number) => ({ user_id: A.userId, client_review_id: crypto.randomUUID(), card_id: id, grade_source: 'self',
    final_rating: 3, response_ms: 1000, reviewed_at: new Date(at).toISOString() });
  const { error } = await admin.from('reviews').insert([review(before, midnight - 60_000), review(after, midnight + 60_000)]);
  if (error) throw error;
  expect((await loadStudy(A.client, undefined, 'Asia/Manila')).newIntroducedToday).toBe(1);
});
