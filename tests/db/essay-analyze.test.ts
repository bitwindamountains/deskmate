import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { analyzeLayer } from '@/lib/essay/analyze';
import { paragraphHash, paragraphs } from '@/lib/essay/text';
import { AllProvidersFailedError, type complete } from '@/llm/router';
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
const { POST } = await import('@/app/api/essays/analyze/route');

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

const P = [
  'Phones should be banned in classrooms because they distract students from learning every single day.',
  'Many students check social media during lessons and lose track of what the teacher explains to them.',
  'In conclusion, banning phones would help students focus better and earn much higher grades overall.',
];
const ESSAY = P.join('\n\n');
const log = (task: string) => [{ task, provider: 'groq', model: 'fake', status: 'ok', tokensIn: 1, tokensOut: 1, latencyMs: 1 }];
const item = (layer: string, paragraph_index: number, quote: string, summary = 's') =>
  ({ layer, category: 'evidence', rubric_criterion: 'Evidence', paragraph_index, quote, severity: 'high', summary, hints: ['q?', 'hint'] });
const GLOBAL = {
  strengths: [{ paragraph_index: 0, quote: 'banned in classrooms', why: 'clear position' }, { paragraph_index: 9, quote: 'not in the essay', why: 'x' }],
  rubric_scores: [{ criterion: 'Thesis', score: 3, justification: 'j', confidence: 'high' }],
  items: [item('global', 0, 'distract students from learning', 'Thesis needs a reason'), item('global', 1, 'robots are coming')],
  safety_concern: false, carried: [],
};
const PARAS = { items: [item('paragraph', 1, 'check social media'), item('paragraph', 0, 'earn much higher grades')], outline: [] }; // wrong index on purpose

type Fake = typeof complete & ReturnType<typeof vi.fn>;
const fakeComplete = (outputs: Record<string, unknown>) =>
  vi.fn(async (task: string) => ({ data: outputs[task], provider: 'groq', model: 'fake', log: log(task) })) as unknown as Fake;
const failComplete = () => vi.fn(async (task: string) => {
  throw new AllProvidersFailedError('all failed', [{ ...log(task)[0], status: 'rate_limited' }] as never);
}) as unknown as Fake;
const ltFetch = (matches: unknown[], status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ matches }), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

async function newDraft(u: User, content = ESSAY, essayId?: string, version = 1) {
  const essay = essayId ?? (await u.client.from('essays').insert({ user_id: u.userId, title: 'Phones', essay_type: 'argumentative' }).select('id').single()).data!.id;
  const paras = paragraphs(content);
  const { data, error } = await u.client.from('drafts').insert({
    user_id: u.userId, essay_id: essay, version, content, word_count: content.split(/\s+/).length,
    paragraph_hashes: await Promise.all(paras.map(paragraphHash)),
  }).select('id').single();
  if (error) throw error;
  return { essayId: essay as string, draftId: data.id as string };
}
const essays = async (userId: string) => (await adminClient().from('quota_usage').select('essays').eq('user_id', userId).maybeSingle()).data?.essays ?? 0;
// Status keys only: claim_layer also stores <layer>_at claim times.
const layers = async (draftId: string) => Object.fromEntries(Object.entries(
  (await adminClient().from('drafts').select('layers').eq('id', draftId).single()).data!.layers as Record<string, string>).filter(([k]) => !k.endsWith('_at')));

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  const now = new Date().toISOString();
  const { error } = await adminClient().from('profiles')
    .upsert([A, B].map((u) => ({ user_id: u.userId, adult_attested_at: now, onboarded_at: now })), { onConflict: 'user_id' });
  if (error) throw error;
});
afterAll(async () => { await deleteTestUsers(created); });

test('global layer stores scores, anchored strengths and items; drops the unanchorable quote and counts it', async () => {
  const { draftId } = await newDraft(A);
  const fn = fakeComplete({ essay_global: GLOBAL });
  const r = await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fn });
  expect(r).toMatchObject({ ok: true, already: false, dropped: 2 });
  if (!r.ok) return;
  expect(r.items).toHaveLength(1);
  expect(r.items[0]).toMatchObject({ layer: 'global', paragraph_index: 0, quote: 'distract students from learning', anchor_start: P[0].indexOf('distract students'), hints: ['q?', 'hint'], source: 'llm', status: 'open' });
  expect(r.analysis?.strengths).toEqual([{ paragraph_index: 0, quote: 'banned in classrooms', why: 'clear position', start: P[0].indexOf('banned'), end: P[0].indexOf('banned') + 'banned in classrooms'.length }]);
  expect(r.analysis?.safety_concern).toBe(false);
  expect(await layers(draftId)).toEqual({ global: 'done' });
  const calls = (await adminClient().from('llm_calls').select('task').eq('user_id', A.userId)).data!;
  expect(calls.map((c) => c.task)).toContain('essay_global');
});

test('second call for a done layer returns saved items with no LLM call', async () => {
  const { draftId } = await newDraft(A);
  await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) });
  const again = fakeComplete({ essay_global: GLOBAL });
  const r = await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: again });
  expect(again).not.toHaveBeenCalled();
  expect(r).toMatchObject({ ok: true, already: true });
  if (r.ok) expect(r.items).toHaveLength(1);
});

test('busy then retry charges quota once and does not rerun the finished global layer', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const { draftId } = await newDraft(U);
  const busy = await analyzeLayer(U.client, U.userId, draftId, 'global', {}, { completeFn: failComplete() });
  expect(busy).toEqual({ ok: false, status: 503, error: 'busy', message: 'Feedback is busy right now. Your essay is saved; try again in a minute.' });
  expect(await layers(draftId)).toEqual({ global: 'failed' });
  expect(await essays(U.userId)).toBe(1);
  expect((await analyzeLayer(U.client, U.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) })).ok).toBe(true);
  const para = fakeComplete({ essay_paragraphs: PARAS });
  expect((await analyzeLayer(U.client, U.userId, draftId, 'paragraphs', {}, { completeFn: para })).ok).toBe(true);
  expect(para.mock.calls.map((c) => c[0])).toEqual(['essay_paragraphs']);
  expect(await essays(U.userId)).toBe(1);
  const statuses = (await adminClient().from('llm_calls').select('status').eq('user_id', U.userId)).data!.map((c) => c.status).sort();
  expect(statuses).toEqual(['ok', 'ok', 'rate_limited']);
});

test('sixth draft of the day is 429 with the quota message and no LLM call', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const first = await newDraft(U);
  for (let v = 1; v <= 5; v++) {
    const d = v === 1 ? first : await newDraft(U, ESSAY, first.essayId, v);
    expect((await U.client.rpc('consume_essay_quota', { p_draft_id: d.draftId })).data).toBe(true);
  }
  const sixth = await newDraft(U, ESSAY, first.essayId, 6);
  const fn = fakeComplete({ essay_global: GLOBAL });
  const r = await analyzeLayer(U.client, U.userId, sixth.draftId, 'global', {}, { completeFn: fn });
  expect(r).toEqual({ ok: false, status: 429, error: 'quota', message: "You've used today's 5 essay checks. They reset at midnight UTC." });
  expect(fn).not.toHaveBeenCalled();
  expect(await layers(sixth.draftId)).toEqual({ global: 'failed' });
});

test('another user draft is 404 with no LLM call', async () => {
  const { draftId } = await newDraft(B);
  const fn = fakeComplete({ essay_global: GLOBAL });
  expect(await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fn }))
    .toEqual({ ok: false, status: 404, error: 'not_found', message: "We couldn't find that essay." });
  expect(fn).not.toHaveBeenCalled();
});

test('sentences layer saves LanguageTool items with convention flags; LanguageTool down is 503 for that layer only', async () => {
  const { draftId } = await newDraft(A);
  await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) });
  const down = await analyzeLayer(A.client, A.userId, draftId, 'sentences', {}, { fetchFn: ltFetch([], 429) });
  expect(down).toMatchObject({ ok: false, status: 503 });
  expect(await layers(draftId)).toEqual({ global: 'done', sentences: 'failed' });
  const at = P[0].length + 2 + P[1].length + 2; // P2 starts here in the joined text
  const lt = ltFetch([
    { message: 'Possible typo', offset: 0, length: 6, replacements: [{ value: 'Phone' }], rule: { category: { id: 'TYPOS' } } },
    { message: 'Comma', offset: at + 13, length: 1, replacements: [], rule: { category: { id: 'PUNCTUATION' } } },
  ]);
  const r = await analyzeLayer(A.client, A.userId, draftId, 'sentences', {}, { fetchFn: lt });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const sentence = r.items.filter((i) => i.layer === 'sentence');
  expect(sentence.map((i) => [i.paragraph_index, i.quote, i.convention, i.source])).toEqual([[0, 'Phones', false, 'languagetool'], [2, ',', true, 'languagetool']]);
  expect(sentence[0].replacements).toEqual(['Phone']);
});

test('draft 2: unchanged paragraph items are copied, changed paragraphs alone are sent, omitted judged items stay open', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const now = new Date().toISOString();
  await adminClient().from('profiles').upsert({ user_id: U.userId, adult_attested_at: now, onboarded_at: now }, { onConflict: 'user_id' });
  const d1 = await newDraft(U);
  await analyzeLayer(U.client, U.userId, d1.draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) });
  await analyzeLayer(U.client, U.userId, d1.draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: PARAS }) });
  const old = (await adminClient().from('feedback_items').select('id,layer,paragraph_index,quote').eq('draft_id', d1.draftId)).data!;
  const oldGlobal = old.find((i) => i.layer === 'global')!;
  const oldP1 = old.find((i) => i.quote === 'check social media')!;
  const oldP2 = old.find((i) => i.quote === 'earn much higher grades')!;
  expect(oldP2.paragraph_index).toBe(2); // anchoring corrected the model's wrong index

  const d2 = await newDraft(U, [P[0], P[1], 'In conclusion, a ban helps everyone focus.'].join('\n\n'), d1.essayId, 2);
  const para = fakeComplete({ essay_paragraphs: { items: [], outline: [] } });
  const p = await analyzeLayer(U.client, U.userId, d2.draftId, 'paragraphs', {}, { completeFn: para });
  expect(p.ok).toBe(true);
  expect((para.mock.calls[0][1] as { system: string }).system).toContain('Report only on paragraphs [P2]');
  const glob = fakeComplete({ essay_global: { ...GLOBAL, carried: [{ id: oldGlobal.id, status: 'addressed' }, { id: 'invented', status: 'open' }] } });
  const g = await analyzeLayer(U.client, U.userId, d2.draftId, 'global', {}, { completeFn: glob });
  expect(g.ok).toBe(true);
  const sent = (glob.mock.calls[0][1] as { user: string }).user;
  expect(sent).toContain(oldGlobal.id);
  expect(sent).toContain(oldP2.id);
  expect(sent).not.toContain(oldP1.id);

  const items = (await adminClient().from('feedback_items').select('carried_from_id,status,paragraph_index,anchor_start').eq('draft_id', d2.draftId)).data!;
  expect(items.find((i) => i.carried_from_id === oldP1.id)).toMatchObject({ status: 'open', paragraph_index: 1, anchor_start: P[1].indexOf('check social media') });
  expect(items.find((i) => i.carried_from_id === oldP2.id)).toMatchObject({ status: 'open', anchor_start: null });
  expect(items.find((i) => i.carried_from_id === oldGlobal.id)).toBeUndefined();
  expect((await adminClient().from('feedback_items').select('status').eq('id', oldGlobal.id).single()).data!.status).toBe('addressed');
});

test('draft 2: a failed paragraphs layer then a retry saves each carried item once', async () => {
  const U = await createTestUser(); created.push(U.userId);
  const now = new Date().toISOString();
  await adminClient().from('profiles').upsert({ user_id: U.userId, adult_attested_at: now, onboarded_at: now }, { onConflict: 'user_id' });
  const d1 = await newDraft(U);
  await analyzeLayer(U.client, U.userId, d1.draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: PARAS }) });
  const d2 = await newDraft(U, [P[0], P[1], 'In conclusion, a ban helps everyone focus.'].join('\n\n'), d1.essayId, 2);
  expect(await analyzeLayer(U.client, U.userId, d2.draftId, 'paragraphs', {}, { completeFn: failComplete() })).toMatchObject({ ok: false, status: 503 });
  expect((await analyzeLayer(U.client, U.userId, d2.draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { items: [], outline: [] } }) })).ok).toBe(true);
  const carried = (await adminClient().from('feedback_items').select('carried_from_id').eq('draft_id', d2.draftId).not('carried_from_id', 'is', null)).data!;
  expect(carried).toHaveLength(1); // the P1 item; the P2 item belongs to the global judgement
});

test('an over-long model summary is clamped to the column limit and the layer still finishes', async () => {
  const { draftId } = await newDraft(A);
  const long = { ...GLOBAL, items: [{ ...item('global', 0, 'distract students from learning'), summary: 'x'.repeat(1500) }] };
  const r = await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: long }) });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.items[0].summary.length).toBeLessThanOrEqual(1000);
  expect(await layers(draftId)).toEqual({ global: 'done' });
});

test('a global retry still finishes when the analyses row already exists', async () => {
  const { draftId } = await newDraft(A);
  // as if an earlier attempt saved the analysis and then failed on a later write
  await A.client.from('analyses').insert({ user_id: A.userId, draft_id: draftId, rubric_scores: [], strengths: [] });
  const r = await analyzeLayer(A.client, A.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) });
  expect(r.ok).toBe(true);
  expect(await layers(draftId)).toEqual({ global: 'done' });
});

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/essays/analyze', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

test('POST with an unknown layer is 400; without a session is 401', async () => {
  session.client = A.client;
  const res = await post({ draftId: crypto.randomUUID(), layer: 'words' });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'bad_request' });
  session.client = anonClient();
  expect((await post({ draftId: crypto.randomUUID(), layer: 'global' })).status).toBe(401);
});

test('POST for another user draft is 404 with the error shape', async () => {
  const { draftId } = await newDraft(B);
  session.client = A.client;
  const res = await post({ draftId, layer: 'global' });
  expect(res.status).toBe(404);
  expect(Object.keys(await res.json()).sort()).toEqual(['error', 'message']);
});

async function freshUser() {
  const U = await createTestUser(); created.push(U.userId);
  const now = new Date().toISOString();
  await adminClient().from('profiles').upsert({ user_id: U.userId, adult_attested_at: now, onboarded_at: now }, { onConflict: 'user_id' });
  return U;
}
const outlineOf = async (draftId: string) => (await adminClient().from('drafts').select('outline').eq('id', draftId).single()).data!.outline;

test('global layer stores prompt_alignment; paragraphs layer stores the outline via set_outline', async () => {
  const U = await freshUser();
  const { draftId, essayId } = await newDraft(U);
  await adminClient().from('essays').update({ assignment_prompt: 'Argue for or against phone bans.' }).eq('id', essayId);
  const alignment = [{ part: 'Take a position', status: 'addressed', note: 'Clear stance.' }];
  await analyzeLayer(U.client, U.userId, draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: { ...GLOBAL, prompt_alignment: alignment } }) });
  expect((await adminClient().from('analyses').select('prompt_alignment').eq('draft_id', draftId).single()).data!.prompt_alignment).toEqual(alignment);
  const outline = P.map((_, i) => ({ paragraph_index: i, summary: `Point ${i}`, flag: null }));
  await analyzeLayer(U.client, U.userId, draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { ...PARAS, outline } }) });
  expect(await outlineOf(draftId)).toEqual(outline);
});

test('re-check carries outline lines of unchanged paragraphs and fills changed ones', async () => {
  const U = await freshUser();
  const d1 = await newDraft(U);
  const outline = P.map((_, i) => ({ paragraph_index: i, summary: `Point ${i}`, flag: null }));
  await analyzeLayer(U.client, U.userId, d1.draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { ...PARAS, outline } }) });
  // P1 moves to index 2; a new paragraph is inserted at index 1
  const d2 = await newDraft(U, [P[0], 'A brand new paragraph about teachers and their rules for phones in class.', P[1], P[2]].join('\n\n'), d1.essayId, 2);
  const fresh = [{ paragraph_index: 1, summary: 'Teachers set rules', flag: 'order' }];
  await analyzeLayer(U.client, U.userId, d2.draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { items: [], outline: fresh } }) });
  expect(await outlineOf(d2.draftId)).toEqual([
    { paragraph_index: 0, summary: 'Point 0', flag: null },
    { paragraph_index: 1, summary: 'Teachers set rules', flag: 'order' },
    { paragraph_index: 2, summary: 'Point 1', flag: null },
    { paragraph_index: 3, summary: 'Point 2', flag: null },
  ]);
});

test('a failed outline save then a retry saves each paragraph item once', async () => {
  const U = await freshUser();
  const { draftId } = await newDraft(U);
  const outline = P.map((_, i) => ({ paragraph_index: i, summary: `Point ${i}`, flag: null }));
  // The same client, except that set_outline fails the first time.
  let failOnce = true;
  const flaky = new Proxy(U.client, { get: (t, k) => (k === 'rpc'
    ? (name: string, args: unknown) => (name === 'set_outline' && failOnce ? (failOnce = false, Promise.resolve({ data: null, error: { message: 'boom' } })) : t.rpc(name, args as never))
    : Reflect.get(t, k)) }) as typeof U.client;
  const first = await analyzeLayer(flaky, U.userId, draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { ...PARAS, outline } }) });
  expect(first.ok).toBe(false);
  const retry = await analyzeLayer(U.client, U.userId, draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { ...PARAS, outline } }) });
  expect(retry.ok).toBe(true);
  expect((await adminClient().from('feedback_items').select('id').eq('draft_id', draftId).eq('layer', 'paragraph')).data).toHaveLength(2);
  expect(await outlineOf(draftId)).toEqual(outline);
});

test('POST returns the saved outline with the items', async () => {
  const U = await freshUser();
  const { draftId } = await newDraft(U);
  const outline = P.map((_, i) => ({ paragraph_index: i, summary: `Point ${i}`, flag: null }));
  await analyzeLayer(U.client, U.userId, draftId, 'paragraphs', {}, { completeFn: fakeComplete({ essay_paragraphs: { ...PARAS, outline } }) });
  session.client = U.client;
  // The layer is done, so this answers from the database without an LLM call.
  const res = await POST(new NextRequest('http://localhost/api/essays/analyze', { method: 'POST', body: JSON.stringify({ draftId, layer: 'paragraphs' }) }));
  expect(res.status).toBe(200);
  expect((await res.json()).outline).toEqual(outline);
});

test('re-check judging sends the revised summary for a revised item', async () => {
  const U = await freshUser();
  const d1 = await newDraft(U);
  await analyzeLayer(U.client, U.userId, d1.draftId, 'global', {}, { completeFn: fakeComplete({ essay_global: GLOBAL }) });
  const g = (await adminClient().from('feedback_items').select('id').eq('draft_id', d1.draftId).eq('layer', 'global').limit(1).single()).data!;
  await adminClient().from('feedback_items').update({ revised_summary: 'Name one reason in the thesis.' }).eq('id', g.id);
  const d2 = await newDraft(U, [P[0] + ' Now revised.', P[1], P[2]].join('\n\n'), d1.essayId, 2);
  const glob = fakeComplete({ essay_global: GLOBAL });
  await analyzeLayer(U.client, U.userId, d2.draftId, 'global', {}, { completeFn: glob });
  expect((glob.mock.calls[0][1] as { user: string }).user).toContain('Name one reason in the thesis.');
});

test('the analyze layer passes timed minutes from the essay on draft 2 as well', async () => {
  const U = await freshUser();
  const d1 = await newDraft(U);
  await adminClient().from('essays').update({ timed_minutes: 45 }).eq('id', d1.essayId);
  const d2 = await newDraft(U, [P[0], P[1], 'A new ending paragraph that wraps up the argument clearly.'].join('\n\n'), d1.essayId, 2);
  const glob = fakeComplete({ essay_global: GLOBAL });
  await analyzeLayer(U.client, U.userId, d2.draftId, 'global', {}, { completeFn: glob });
  expect((glob.mock.calls[0][1] as { user: string }).user).toContain('45-minute time limit');
});
