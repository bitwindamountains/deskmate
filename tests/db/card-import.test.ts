import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { importCards } from '@/lib/cards/transfer';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { GET } = await import('@/app/api/decks/[deckId]/export/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
let deck: string;
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  deck = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Bio' }).select('id').single()).data!.id;
});
afterAll(async () => { await deleteTestUsers(created); });

test('importCards adds kept cards to the deck and refuses another user deck', async () => {
  const r = await importCards(A.client, A.userId, deck, 'front,back,concept\nWhere is ATP made?,Mitochondria,Cells\n,skip me,\n');
  expect(r).toEqual({ ok: true, added: 1, skipped: 1 });
  const cards = (await adminClient().from('cards').select('front,status,source_chunk_id,concept').eq('deck_id', deck)).data!;
  expect(cards).toEqual([{ front: 'Where is ATP made?', status: 'kept', source_chunk_id: null, concept: 'Cells' }]);
  expect(await importCards(B.client, B.userId, deck, 'front,back\nQ,A')).toEqual({ ok: false, message: "We couldn't find that deck." });
  expect(await importCards(A.client, A.userId, deck, 'nope')).toEqual({ ok: false, message: 'The first row needs "front" and "back" columns.' });
});

test('export returns the deck as CSV or Anki text, and 404 for another user', async () => {
  const req = (format: string) => new NextRequest(`http://localhost/api/decks/${deck}/export?format=${format}`);
  const params = { params: Promise.resolve({ deckId: deck }) };
  session.client = A.client;
  const csv = await GET(req('csv'), params);
  expect(csv.headers.get('content-type')).toContain('text/csv');
  expect(csv.headers.get('content-disposition')).toBe(`attachment; filename="Bio.csv"; filename*=UTF-8''Bio.csv`);
  expect(await csv.text()).toContain('Where is ATP made?,Mitochondria,Cells,basic');
  const anki = await GET(req('anki'), params);
  expect(await anki.text()).toContain('Where is ATP made?\tMitochondria');
  expect((await GET(req('pdf'), params)).status).toBe(400);
  session.client = B.client;
  expect((await GET(req('csv'), params)).status).toBe(404);
  session.client = anonClient();
  expect((await GET(req('csv'), params)).status).toBe(401);
});

test('a non-ASCII deck title still downloads, with an ASCII fallback name', async () => {
  const d = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Biología 生物' }).select('id').single()).data!.id;
  session.client = A.client;
  const res = await GET(new NextRequest(`http://localhost/api/decks/${d}/export?format=csv`), { params: Promise.resolve({ deckId: d }) });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-disposition')).toBe(`attachment; filename="Biologa.csv"; filename*=UTF-8''${encodeURIComponent('Biología 生物')}.csv`);
});
