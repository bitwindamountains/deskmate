import { afterAll, beforeAll, expect, test } from 'vitest';
import { insertSource } from '@/lib/import/create-source';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});
afterAll(async () => { await deleteTestUsers(created); });

// two paragraphs of 1000 words each -> 2 chunks at 1500 words
const para = (w: string) => Array.from({ length: 1000 }, () => w).join(' ');
const text = `${para('alpha')}\n\n${para('beta')}`;

test('createSource stores chunks with positions 0..n-1 and does not consume quota', async () => {
  const r = await insertSource(A.client, A.userId, { newDeckTitle: 'Bio', title: 'Notes', kind: 'text', pages: [{ page: 1, text }] });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const { data: chunks } = await adminClient().from('source_chunks').select('position,generated_at').eq('source_id', r.sourceId).order('position');
  expect(chunks?.map((c) => c.position)).toEqual([0, 1]);
  expect(chunks?.every((c) => c.generated_at === null)).toBe(true);
  const { data: src } = await adminClient().from('sources').select('quota_consumed_at,page_count,kind,card_density').eq('id', r.sourceId).single();
  expect(src).toEqual({ quota_consumed_at: null, page_count: 4, kind: 'text', card_density: 'standard' });
});

test('createSource stores the chosen card types; all three by default; an unknown type is refused', async () => {
  const r = await insertSource(A.client, A.userId, { newDeckTitle: 'Law', title: 'Notes', kind: 'text', pages: [{ page: 1, text }], cardTypes: ['why'] });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect((await adminClient().from('sources').select('card_types').eq('id', r.sourceId).single()).data).toEqual({ card_types: ['why'] });
  const d = await insertSource(A.client, A.userId, { newDeckTitle: 'Law 2', title: 'Notes', kind: 'text', pages: [{ page: 1, text }] });
  if (!d.ok) throw new Error(d.error);
  expect((await adminClient().from('sources').select('card_types').eq('id', d.sourceId).single()).data).toEqual({ card_types: ['basic', 'cloze', 'why'] });
  const { data: deck } = await A.client.from('decks').select('id').limit(1).single();
  expect((await A.client.from('sources').insert({ user_id: A.userId, deck_id: deck!.id, title: 'x', kind: 'text', page_count: 1, card_types: ['essay'] })).error).not.toBeNull();
});

test('createSource stores the chosen card density; an unknown one is refused', async () => {
  const r = await insertSource(A.client, A.userId, { newDeckTitle: 'Chem', title: 'Notes', kind: 'text', pages: [{ page: 1, text }], cardDensity: 'more' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect((await adminClient().from('sources').select('card_density').eq('id', r.sourceId).single()).data).toEqual({ card_density: 'more' });
  const { data: deck } = await A.client.from('decks').select('id').limit(1).single();
  const bad = await A.client.from('sources').insert({ user_id: A.userId, deck_id: deck!.id, title: 'x', kind: 'text', page_count: 1, card_density: 'lots' });
  expect(bad.error).not.toBeNull();
});

test('createSource with another user deckId fails and leaves nothing behind', async () => {
  const { data: deck } = await B.client.from('decks').insert({ user_id: B.userId, title: 'Theirs' }).select('id').single();
  const r = await insertSource(A.client, A.userId, { deckId: deck!.id, title: 'x', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(30) }] });
  expect(r).toEqual({ ok: false, error: "We couldn't save your material. Please try again." });
  const { count } = await adminClient().from('sources').select('id', { count: 'exact', head: true }).eq('user_id', A.userId).eq('deck_id', deck!.id);
  expect(count).toBe(0);
});

test('server re-validates: oversize text is rejected before any insert', async () => {
  const r = await insertSource(A.client, A.userId, { newDeckTitle: 'Big', title: 'x', kind: 'text', pages: [{ page: 1, text: 'w '.repeat(100_000) }] });
  expect(r.ok).toBe(false);
  const { count } = await adminClient().from('decks').select('id', { count: 'exact', head: true }).eq('user_id', A.userId).eq('title', 'Big');
  expect(count).toBe(0);
});
