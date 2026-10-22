import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { importAnkiCards, importCards } from '@/lib/cards/transfer';
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
  expect(r).toEqual({ ok: true, added: 1, skippedRows: [3], inDeck: 0, inFile: 0 });
  const cards = (await adminClient().from('cards').select('front,status,source_chunk_id,concept').eq('deck_id', deck)).data!;
  expect(cards).toEqual([{ front: 'Where is ATP made?', status: 'kept', source_chunk_id: null, concept: 'Cells' }]);
  expect(await importCards(B.client, B.userId, deck, 'front,back\nQ,A')).toEqual({ ok: false, message: "We couldn't find that deck." });
  expect(await importCards(A.client, A.userId, deck, 'nope')).toEqual({ ok: false, message: 'The first row needs "front" and "back" columns.' });
});

test('importAnkiCards adds new cards, counts ones already in the deck, and rejects malformed input', async () => {
  const r = await importAnkiCards(A.client, A.userId, deck, [
    { front: 'where is ATP made?', back: 'Mitochondria', concept: '', type: 'basic' },
    { front: '{{c1::Ribosomes}} make proteins', back: 'Ribosomes', concept: 'Cells', type: 'cloze' },
  ]);
  expect(r).toEqual({ ok: true, added: 1, skippedRows: [], inDeck: 1, inFile: 0 });
  const bad = { ok: false, message: "We couldn't import that file." };
  expect(await importAnkiCards(A.client, A.userId, deck, [{ front: '', back: 'x', concept: '', type: 'basic' }])).toEqual(bad);
  expect(await importAnkiCards(A.client, A.userId, deck, [{ front: 'q', back: 'x', concept: '', type: 'essay' }])).toEqual(bad);
  expect(await importAnkiCards(A.client, A.userId, deck, 'nope')).toEqual(bad);
  expect(await importAnkiCards(B.client, B.userId, deck, [{ front: 'q', back: 'x', concept: '', type: 'basic' }])).toEqual({ ok: false, message: "We couldn't find that deck." });
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

test("a title with ' ( ) * is fully percent-encoded in filename*", async () => {
  const d = (await A.client.from('decks').insert({ user_id: A.userId, title: "Bio (Kim's) *notes*" }).select('id').single()).data!.id;
  session.client = A.client;
  const res = await GET(new NextRequest(`http://localhost/api/decks/${d}/export?format=csv`), { params: Promise.resolve({ deckId: d }) });
  expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Bio%20%28Kim%27s%29%20%2Anotes%2A.csv");
});

test('importing the same file twice adds nothing the second time, and repeats inside a file count once', async () => {
  const d = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Dup' }).select('id').single()).data!.id;
  const file = 'front,back\nQ1,A1\nq1 , a1\nQ2,A2\n';
  expect(await importCards(A.client, A.userId, d, file)).toEqual({ ok: true, added: 2, skippedRows: [], inDeck: 0, inFile: 1 });
  expect(await importCards(A.client, A.userId, d, file)).toEqual({ ok: true, added: 0, skippedRows: [], inDeck: 3, inFile: 0 });
  expect((await adminClient().from('cards').select('id').eq('deck_id', d)).data).toHaveLength(2);
});

test('a card discarded in triage does not block importing it again', async () => {
  const d = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Triaged' }).select('id').single()).data!.id;
  await adminClient().from('cards').insert({ user_id: A.userId, deck_id: d, type: 'basic', front: 'Q', back: 'A', source_quote: '', concept: '',
    bloom_level: 'remember', importance: 2, status: 'discarded', discard_reason: 'trivial' });
  expect(await importCards(A.client, A.userId, d, 'front,back\nQ,A\n')).toEqual({ ok: true, added: 1, skippedRows: [], inDeck: 0, inFile: 0 });
});

test('a deck over 1,000 cards: duplicates are found past the first 1,000, and export includes every card', async () => {
  const d = (await A.client.from('decks').insert({ user_id: A.userId, title: 'Big' }).select('id').single()).data!.id;
  const rows = Array.from({ length: 1005 }, (_, k) => ({ user_id: A.userId, deck_id: d, type: 'basic', front: `Q${k}`, back: `A${k}`,
    source_quote: '', concept: '', bloom_level: 'remember', importance: 2, status: 'kept' }));
  const { error } = await adminClient().from('cards').insert(rows);
  if (error) throw error;
  expect(await importCards(A.client, A.userId, d, 'front,back\nQ1004,A1004\nQ0,A0\n')).toEqual({ ok: true, added: 0, skippedRows: [], inDeck: 2, inFile: 0 });
  session.client = A.client;
  const res = await GET(new NextRequest(`http://localhost/api/decks/${d}/export?format=csv`), { params: Promise.resolve({ deckId: d }) });
  expect((await res.text()).trim().split('\r\n')).toHaveLength(1006); // header + 1,005 cards
}, 60_000);
