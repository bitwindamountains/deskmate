import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadDeckCards } from '@/lib/cards/deck-cards';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

let A: { client: Client; userId: string };
let deck: string;
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  deck = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Big' }).select('id').single()).data!.id;
  const rows = Array.from({ length: 1002 }, (_, i) => ({ user_id: A.userId, deck_id: deck, source_chunk_id: null, type: 'basic', front: `Q${i}`,
    back: 'A', key_points: [], source_quote: '', concept: 'C', bloom_level: 'remember', importance: 2, status: i === 0 ? 'discarded' : 'kept' }));
  expect((await adminClient().from('cards').insert(rows)).error).toBeNull();
});
afterAll(async () => { await deleteTestUsers(created); });

test('loadDeckCards returns every listed card past the 1,000-row API cap, discarded ones left out', async () => {
  const cards = await loadDeckCards(A.client, deck);
  expect(cards).toHaveLength(1001);
  expect(cards.find((c) => c.front === 'Q1')).toMatchObject({ front: 'Q1', back: 'A', concept: 'C', status: 'kept', lapses: 0, sourceId: null });
  expect(new Set(cards.map((c) => c.id)).size).toBe(1001);
});
