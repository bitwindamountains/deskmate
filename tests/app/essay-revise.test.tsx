import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ItemRow } from '@/lib/essay/analyze';

const carryOverCounts = vi.fn();
vi.mock('@/app/(app)/write/[essayId]/item-actions', () => ({
  markGotIt: vi.fn(), logViewedLevel: vi.fn(),
  carryOverCounts: (...a: unknown[]) => carryOverCounts(...a),
}));
const saveDraft = vi.fn();
vi.mock('@/app/(app)/write/actions', () => ({ saveDraft: (...a: unknown[]) => saveDraft(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  notFound: () => { throw new Error('NOT_FOUND'); },
}));
let tables: Record<string, unknown[]> = {};
// a query chain whose builder methods return itself and which awaits to the table's rows
const chain = (t: string): unknown => new Proxy({}, {
  get: (_, k) => (k === 'then' ? (r: (v: unknown) => void) => r({ data: tables[t], error: null })
    : k === 'maybeSingle' ? () => chain(`${t}:one`) : () => chain(t)),
});
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: chain }) }));
vi.mock('@/lib/profile/require', () => ({ requireOnboardedUser: async () => ({ userId: 'u1', profile: {} }) }));

import { EssayView } from '@/app/(app)/write/[essayId]/essay-view';
import ComparePage from '@/app/(app)/write/[essayId]/compare/page';

const ESSAY = '11111111-1111-4111-8111-111111111111';
const DRAFT = '22222222-2222-4222-8222-222222222222';
const PARAS = ['The first paragraph says one thing.', 'The second paragraph says another.'];
const CONTENT = PARAS.join('\n\n');
const KEY = `scholar-essay-draft-${ESSAY}`;
const OFFLINE = "You're offline. Your edits are saved on this device; re-check when you're back online.";
const DONE = { global: 'done', paragraphs: 'done', sentences: 'done' };

type Props = Partial<React.ComponentProps<typeof EssayView>>;
const view = (p: Props = {}) => render(
  <EssayView essayId={ESSAY} draftId={DRAFT} version={1} content={CONTENT} paragraphs={PARAS} layers={DONE} items={[]} analysis={null}
    rewritesUsed={0} showScores rubricMax={{}} {...p} />,
);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const box = () => screen.getByLabelText('Edit your essay') as HTMLTextAreaElement;

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); tables = {}; });

test('edits survive a reload via localStorage and clear after Re-check', async () => {
  view();
  expect(screen.queryByLabelText('Edit your essay')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(box().value).toBe(CONTENT);
  fireEvent.change(box(), { target: { value: `${CONTENT} More.` } });
  expect(localStorage.getItem(KEY)).toBe(`${CONTENT} More.`);
  cleanup();

  view(); // reload: unsent edits reopen the editor
  expect((await screen.findByLabelText('Edit your essay') as HTMLTextAreaElement).value).toBe(`${CONTENT} More.`);
  saveDraft.mockResolvedValueOnce({ ok: true, draftId: 'd2', version: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(saveDraft).toHaveBeenCalledWith(ESSAY, `${CONTENT} More.`);
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('unchanged text says so and does not re-run analysis; a failed save keeps the edits', async () => {
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  saveDraft.mockResolvedValueOnce({ ok: true, draftId: DRAFT, version: 1, unchanged: true });
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
  expect(await screen.findByText('No changes since your last check.')).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.change(box(), { target: { value: 'Too short.' } });
  saveDraft.mockResolvedValueOnce({ ok: false, error: 'Your essay needs at least 50 words.' });
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Your essay needs at least 50 words.');
  expect(localStorage.getItem(KEY)).toBe('Too short.');
});

test('Re-check while offline is disabled with the offline message', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect((screen.getByRole('button', { name: 'Re-check' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(OFFLINE)).toBeTruthy();
  online.mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event('online')); });
  expect((screen.getByRole('button', { name: 'Re-check' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText(OFFLINE)).toBeNull();
  online.mockReturnValue(false);
  act(() => { window.dispatchEvent(new Event('offline')); });
  expect(screen.getByText(OFFLINE)).toBeTruthy();
});

test('after re-check the carry-over summary counts addressed, partial, open', async () => {
  const carried = { id: 'c1', layer: 'global', category: 'thesis', rubric_criterion: 'Thesis', paragraph_index: null, quote: null, anchor_start: null,
    anchor_end: null, severity: 'high', summary: 'Carried summary', hints: [], rewrite: null, replacements: [], convention: false, source: 'llm',
    status: 'partial', highest_level: 0, carried_from_id: 'old1', revised_summary: null } as ItemRow;
  fetchMock.mockImplementation(async () => json({ items: [carried], analysis: null, dropped: 0, already: false }));
  carryOverCounts.mockResolvedValue({ addressed: 3, partial: 1, open: 2 });
  view({ draftId: 'd2', version: 2, layers: {} });
  expect(await screen.findByText('3 addressed · 1 partly addressed · 2 still open since draft 1')).toBeTruthy();
  expect(carryOverCounts).toHaveBeenCalledWith(ESSAY, 1);
  expect(screen.getByRole('link', { name: 'Compare with draft 1' }).getAttribute('href')).toBe(`/write/${ESSAY}/compare?from=1&to=2`);
  cleanup();

  view({ layers: {} }); // a first draft has nothing to carry over, and nothing to compare
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  expect(carryOverCounts).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('link', { name: /Compare/ })).toBeNull();
});

test('compare marks added and removed words with text labels and lists score changes', async () => {
  const scores = (n: number) => [{ criterion: 'Thesis', score: n, justification: '', confidence: 'high' }];
  tables = {
    'essays:one': { id: ESSAY, title: 'Climate' } as never,
    drafts: [{ id: 'a', version: 1, content: 'The cat sat.' }, { id: 'b', version: 2, content: 'The dog sat.' }],
    analyses: [{ draft_id: 'a', rubric_scores: scores(2) }, { draft_id: 'b', rubric_scores: scores(3) }],
    feedback_items: [{ id: 'i1', layer: 'global', summary: 'The thesis is vague.', status: 'addressed' },
      { id: 'i2', layer: 'paragraph', summary: 'Evidence is thin.', status: 'open' },
      { id: 'i3', layer: 'paragraph', summary: 'Original wording.', revised_summary: 'Revised wording.', status: 'disputed' }],
  };
  const page = (from: string, to: string) => ComparePage({ params: Promise.resolve({ essayId: ESSAY }), searchParams: Promise.resolve({ from, to }) });
  render(await page('1', '2'));
  const ins = document.querySelector('ins')!;
  expect(ins.textContent).toContain('dog');
  expect(within(ins).getByText('added')).toBeTruthy();
  const del = document.querySelector('del')!;
  expect(del.textContent).toContain('cat');
  expect(within(del).getByText('removed')).toBeTruthy();

  const table = screen.getByRole('table');
  expect(within(table).getByRole('columnheader', { name: 'Draft 1' })).toBeTruthy();
  expect(within(table).getByRole('row', { name: /Thesis/ }).textContent).toMatch(/Thesis.*2 of 4.*3 of 4/);
  expect(screen.getByText('The thesis is vague.').closest('li')!.textContent).toContain('Addressed');
  expect(screen.getByText('Evidence is thin.').closest('li')!.textContent).toContain('Still open');
  // a coach revision is the feedback now, here too
  expect(screen.getByText('Revised wording.')).toBeTruthy();
  expect(screen.queryByText('Original wording.')).toBeNull();

  await expect(page('x', '2')).rejects.toThrow('NOT_FOUND');
  await expect(page('1', '3')).rejects.toThrow('NOT_FOUND');
  await expect(page('1.5', '2')).rejects.toThrow('NOT_FOUND');
});
