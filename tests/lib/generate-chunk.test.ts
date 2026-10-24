import { expect, test, vi } from 'vitest';
import { generateChunk } from '@/lib/generate/generate-chunk';
import { AllProvidersFailedError, type complete } from '@/llm/router';

const CHUNK_TEXT = 'Glycolysis happens in the cytoplasm and does not need oxygen. The Krebs cycle happens in the mitochondria.';

type Op = { table: string; op: string; args: unknown[] };
/** Chainable fake: every builder method returns the chain; awaiting it resolves via respond(table, op, args). */
function fakeDb(respond: (o: Op) => { data?: unknown; error?: unknown }) {
  const ops: Op[] = [];
  const chain = (table: string) => {
    let op = 'select';
    const args: unknown[] = [];
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'order', 'maybeSingle', 'single', 'in', 'limit']) {
      c[m] = (...a: unknown[]) => {
        if (m === 'insert' || m === 'update') op = m;
        args.push([m, ...a]);
        return c;
      };
    }
    c.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => {
      const o = { table, op, args };
      ops.push(o);
      return Promise.resolve({ data: null, error: null, ...respond(o) }).then(res, rej);
    };
    return c;
  };
  const db = {
    from: (t: string) => chain(t),
    rpc: (fn: string, a: unknown) => {
      const o = { table: fn, op: 'rpc', args: [a] };
      ops.push(o);
      return Promise.resolve({ data: null, error: null, ...respond(o) });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, ops };
}

const chunkRow = (generated_at: string | null = null) => ({
  id: 'chunk-1', text: CHUNK_TEXT, page_start: 2, generated_at, sources: { deck_id: 'deck-1', decks: { subject: 'biology' } },
});
const card = (source_quote: string) => ({
  type: 'basic', front: 'Where does glycolysis happen?', back: 'In the cytoplasm', key_points: ['cytoplasm'],
  source_quote, concept: 'glycolysis', bloom_level: 'remember', importance: 2,
});
const log = [{ task: 'card_generate', provider: 'groq', model: 'm', status: 'ok', tokensIn: 10, tokensOut: 20, latencyMs: 5 }];
const okComplete = (cards: unknown[]) => vi.fn(async () => ({ data: { cards }, provider: 'groq', model: 'm', log })) as unknown as typeof complete & ReturnType<typeof vi.fn>;

test('ungrounded card is dropped and counted', async () => {
  const { db, ops } = fakeDb(({ table, op, args }) => {
    if (table === 'source_chunks' && op === 'select') return { data: chunkRow() };
    if (table === 'cards' && op === 'select') return { data: [] };
    if (table === 'consume_generation_quota') return { data: true };
    if (table === 'cards' && op === 'insert') {
      const rows = (args[0] as unknown[])[1] as Record<string, unknown>[];
      return { data: rows.map((r, i) => ({ id: `card-${i}`, status: 'pending', ...r })) };
    }
    return {};
  });
  const completeFn = okComplete([card('happens in the cytoplasm'), card('made up text not in the chunk')]);
  const r = await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.droppedUngrounded).toBe(1);
  expect(r.cards).toHaveLength(1);
  expect(r.cards[0]).toMatchObject({ source_chunk_id: 'chunk-1', deck_id: 'deck-1', page_start: 2, status: 'pending' });
  expect(r.alreadyGenerated).toBe(false);
  // cards inserted before generated_at is set
  const insertAt = ops.findIndex((o) => o.table === 'cards' && o.op === 'insert');
  const updateAt = ops.findIndex((o) => o.table === 'source_chunks' && o.op === 'update');
  expect(insertAt).toBeGreaterThan(-1);
  expect(updateAt).toBeGreaterThan(insertAt);
  expect(ops.some((o) => o.table === 'llm_calls' && o.op === 'insert')).toBe(true);
});

test("the source's density and the student's discard pattern reach the prompt (B2.2, B2.5)", async () => {
  const discarded = (n: number, reason: string) => Array.from({ length: n }, () => ({ discard_reason: reason }));
  const { db } = fakeDb(({ table, op, args }) => {
    if (table === 'source_chunks' && op === 'select') return { data: { ...chunkRow(), sources: { ...chunkRow().sources, card_density: 'fewer' } } };
    if (table === 'cards' && op === 'select' && JSON.stringify(args).includes('discarded')) return { data: [...discarded(6, 'trivial'), ...discarded(2, 'wrong')] };
    if (table === 'cards' && op === 'select') return { data: [] };
    if (table === 'consume_generation_quota') return { data: true };
    if (table === 'cards' && op === 'insert') return { data: [] };
    return {};
  });
  const completeFn = okComplete([]);
  await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  const user = (completeFn.mock.calls[0] as unknown[])[1] as { user: string };
  expect(user.user).toContain('Card count: fewer than usual');
  expect(user.user).toContain('usually discards cards as too trivial');
});

test('a few scattered discards are not a pattern', async () => {
  const { db } = fakeDb(({ table, op, args }) => {
    if (table === 'source_chunks' && op === 'select') return { data: chunkRow() };
    if (table === 'cards' && op === 'select' && JSON.stringify(args).includes('discarded')) {
      return { data: [{ discard_reason: 'trivial' }, { discard_reason: 'trivial' }, { discard_reason: 'wrong' }] };
    }
    if (table === 'cards' && op === 'select') return { data: [] };
    if (table === 'consume_generation_quota') return { data: true };
    if (table === 'cards' && op === 'insert') return { data: [] };
    return {};
  });
  const completeFn = okComplete([]);
  await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  const user = ((completeFn.mock.calls[0] as unknown[])[1] as { user: string }).user;
  expect(user).not.toContain('discards');
  expect(user).not.toContain('Card count');
});

test('already generated chunk returns existing cards without an LLM call', async () => {
  const existing = { id: 'c1', deck_id: 'deck-1', source_chunk_id: 'chunk-1', status: 'kept' };
  const { db, ops } = fakeDb(({ table, op }) => {
    if (table === 'source_chunks' && op === 'select') return { data: chunkRow('2026-10-20T00:00:00Z') };
    if (table === 'cards' && op === 'select') return { data: [existing] };
    return {};
  });
  const completeFn = okComplete([]);
  const r = await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  expect(r).toEqual({ ok: true, cards: [{ ...existing, page_start: 2 }], droppedUngrounded: 0, alreadyGenerated: true });
  expect(completeFn).not.toHaveBeenCalled();
  expect(ops.some((o) => o.table === 'consume_generation_quota')).toBe(false);
});

test('cards present but generated_at unset (crash recovery) returns them and sets generated_at, no LLM call', async () => {
  const existing = { id: 'c1', deck_id: 'deck-1', source_chunk_id: 'chunk-1', status: 'pending' };
  const { db, ops } = fakeDb(({ table, op }) => {
    if (table === 'source_chunks' && op === 'select') return { data: chunkRow(null) };
    if (table === 'cards' && op === 'select') return { data: [existing] };
    return {};
  });
  const completeFn = okComplete([]);
  const r = await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  expect(r).toMatchObject({ ok: true, alreadyGenerated: true, cards: [{ id: 'c1' }] });
  expect(completeFn).not.toHaveBeenCalled();
  expect(ops.some((o) => o.table === 'source_chunks' && o.op === 'update')).toBe(true);
});

test('missing chunk is 404 without an LLM call', async () => {
  const { db } = fakeDb(() => ({ data: null }));
  const completeFn = okComplete([]);
  const r = await generateChunk(db, 'user-1', 'src-1', 9, {}, completeFn);
  expect(r).toMatchObject({ ok: false, status: 404, error: 'not_found' });
  expect(completeFn).not.toHaveBeenCalled();
});

test('all providers failing gives 503 with the busy copy and no provider text', async () => {
  const { db, ops } = fakeDb(({ table, op }) => {
    if (table === 'source_chunks' && op === 'select') return { data: chunkRow() };
    if (table === 'cards' && op === 'select') return { data: [] };
    if (table === 'consume_generation_quota') return { data: true };
    if (table === 'llm_calls') return { error: { message: 'insert failed' } }; // must not fail the request
    return {};
  });
  const completeFn = vi.fn(async () => {
    throw new AllProvidersFailedError('groq: secret provider text', [{ ...log[0], status: 'error', message: 'secret provider text' }] as never);
  }) as unknown as typeof complete;
  const r = await generateChunk(db, 'user-1', 'src-1', 0, {}, completeFn);
  expect(r).toEqual({ ok: false, status: 503, error: 'busy', message: 'The AI service is busy. Your material is saved; try again in a few minutes.' });
  expect(ops.some((o) => o.table === 'llm_calls')).toBe(true);
  expect(ops.some((o) => o.table === 'source_chunks' && o.op === 'update')).toBe(false);
});
