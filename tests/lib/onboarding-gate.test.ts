import { NextRequest } from 'next/server';
import { beforeEach, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  profile: null as { onboarded_at: string | null } | null,
  insertSource: vi.fn(async () => ({ ok: true, sourceId: 's' })),
  generateChunk: vi.fn(async () => ({ ok: true, cards: [], droppedUngrounded: 0, alreadyGenerated: false })),
  updateStatus: vi.fn(async () => {}),
  updateCard: vi.fn(async () => {}),
  updateEmbeddings: vi.fn(async () => {}),
}));
const client = {
  auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.profile, error: null }) }) }) }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));
vi.mock('@/lib/import/create-source', () => ({ insertSource: m.insertSource }));
vi.mock('@/lib/generate/generate-chunk', () => ({ generateChunk: m.generateChunk }));
vi.mock('@/lib/triage/card-actions', () => ({ updateStatus: m.updateStatus, updateCard: m.updateCard, updateEmbeddings: m.updateEmbeddings }));

const { createSource } = await import('@/app/(app)/study/import/actions');
const { POST } = await import('@/app/api/generate/route');
const triage = await import('@/app/(app)/study/triage/actions');

const ID = '5b0c6a3e-1f2d-4c8a-9e7b-0a1b2c3d4e5f';
const post = () => POST(new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify({ sourceId: ID, position: 0 }) }));
const input = { newDeckTitle: 'Bio', title: 't', kind: 'text' as const, pages: [{ page: 1, text: 'w '.repeat(30) }] };

beforeEach(() => { vi.clearAllMocks(); m.profile = { onboarded_at: null }; });

test('import: not onboarded gets the generic error and nothing is inserted', async () => {
  expect(await createSource(input)).toEqual({ ok: false, error: "We couldn't save your material. Please try again." });
  m.profile = null; // no profile row at all
  expect((await createSource(input)).ok).toBe(false);
  expect(m.insertSource).not.toHaveBeenCalled();
});

test('generate route: not onboarded is 403 not_onboarded and no generation', async () => {
  const res = await post();
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'not_onboarded', message: 'Finish setting up your account first.' });
  expect(m.generateChunk).not.toHaveBeenCalled();
});

test('triage actions: not onboarded throw the generic error and change nothing', async () => {
  const err = "We couldn't save that change.";
  await expect(triage.setCardStatus([ID], 'kept')).rejects.toThrow(err);
  await expect(triage.editCard(ID, { front: 'f' })).rejects.toThrow(err);
  await expect(triage.saveEmbeddings([{ id: ID, embedding: [] }])).rejects.toThrow(err);
  expect(m.updateStatus).not.toHaveBeenCalled();
  expect(m.updateCard).not.toHaveBeenCalled();
  expect(m.updateEmbeddings).not.toHaveBeenCalled();
});

test('onboarded callers pass through to the real work', async () => {
  m.profile = { onboarded_at: '2026-10-20T00:00:00Z' };
  expect(await createSource(input)).toEqual({ ok: true, sourceId: 's' });
  expect((await post()).status).toBe(200);
  await triage.setCardStatus([ID], 'kept');
  expect(m.insertSource).toHaveBeenCalledOnce();
  expect(m.generateChunk).toHaveBeenCalledOnce();
  expect(m.updateStatus).toHaveBeenCalledOnce();
});
