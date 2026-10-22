import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ItemRow } from '@/lib/essay/analyze';

const markGotIt = vi.fn();
const disputeItem = vi.fn();
const logViewedLevel = vi.fn();
vi.mock('@/app/(app)/write/[essayId]/item-actions', () => ({
  markGotIt: (...a: unknown[]) => markGotIt(...a),
  disputeItem: (...a: unknown[]) => disputeItem(...a),
  logViewedLevel: (...a: unknown[]) => logViewedLevel(...a),
}));

import { EssayView, type Analysis } from '@/app/(app)/write/[essayId]/essay-view';

const DRAFT = '22222222-2222-4222-8222-222222222222';
const PARAS = [
  'My thesis is that a thesis that is vague can still work.',
  'Here the evidence badly supports the claim here.',
  'The ending ends the essay abruptly now.',
];
const item = (id: string, p: Partial<ItemRow> & { quote: string | null; paragraph_index: number | null }): ItemRow => {
  const start = p.quote && p.paragraph_index !== null ? PARAS[p.paragraph_index].indexOf(p.quote) : null;
  return {
    id, layer: 'paragraph', category: `cat-${id}`, rubric_criterion: 'Evidence', anchor_start: start,
    anchor_end: start === null ? null : start + p.quote!.length, severity: 'medium', summary: `Summary ${id}`,
    hints: [`Hint one ${id}`, `Hint two ${id}`], rewrite: null, replacements: [], convention: false, source: 'llm', status: 'open',
    highest_level: 0, carried_from_id: null, revised_summary: null, ...p,
  };
};
// Scores: g1 global high 9, p1 paragraph medium 4, g2 global low 3, p2 paragraph low 2, s1 sentence low 1.
const g1 = item('g1', { layer: 'global', severity: 'high', paragraph_index: 0, quote: 'a thesis that is vague' });
const p1 = item('p1', { paragraph_index: 1, quote: 'evidence badly' });
const g2 = item('g2', { layer: 'global', severity: 'low', paragraph_index: null, quote: null });
const p2 = item('p2', { severity: 'low', paragraph_index: 2, quote: 'ends the essay' });
const s1 = item('s1', { layer: 'sentence', severity: 'low', paragraph_index: 1, quote: 'here.', hints: [], source: 'languagetool',
  summary: 'Possible typo', replacements: ['there.'] });
const ALL = [g1, p1, g2, p2, s1];
const DONE = { global: 'done', paragraphs: 'done', sentences: 'done' };
const analysis = (o: Partial<Analysis> = {}): Analysis => ({
  rubric_scores: [
    { criterion: 'Thesis', score: 2, justification: 'The claim is broad.', confidence: 'low' },
    { criterion: 'Evidence', score: 3, justification: 'Sources are relevant.', confidence: 'high' },
  ],
  strengths: [{ paragraph_index: 2, quote: 'The ending', why: 'A clear signal the essay is closing.', start: 0, end: 10 }],
  safety_concern: false, ...o,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (items: ItemRow[], a: Analysis | null = analysis()) => json({ items, analysis: a, dropped: 0, already: false });
const BUSY = 'Feedback is busy right now. Your essay is saved; try again in a minute.';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  markGotIt.mockResolvedValue(undefined);
  disputeItem.mockResolvedValue(undefined);
  logViewedLevel.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

type Props = Partial<React.ComponentProps<typeof EssayView>>;
const view = (p: Props = {}) => render(
  <EssayView essayId="11111111-1111-4111-8111-111111111111" draftId={DRAFT} version={1} content={PARAS.join('\n\n')} paragraphs={PARAS} layers={DONE} items={ALL} analysis={analysis()} rewritesUsed={0} showScores
    rubricMax={{ Thesis: 4, Evidence: 4 }} {...p} />,
);
const card = (id: string) => document.getElementById(`card-${id}`)!;
const press = () => fireEvent.click(document.activeElement!); // Enter or Space on a focused button
const deferred = () => { let resolve!: (r: Response) => void; const promise = new Promise<Response>((r) => { resolve = r; }); return { promise, resolve }; };

test('layers load in order with their progress copy; a failed paragraph layer shows Try again while global feedback stays', async () => {
  const global = deferred(), paras = deferred(), sents = deferred();
  fetchMock.mockReturnValueOnce(global.promise).mockReturnValueOnce(paras.promise).mockReturnValueOnce(sents.promise);
  view({ layers: {}, items: [], analysis: null });
  expect(await screen.findByText('Reading the big picture…')).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ draftId: DRAFT, layer: 'global' });
  await act(async () => global.resolve(ok([g1])));
  expect(await screen.findByText('Checking paragraphs…')).toBeTruthy();
  expect(screen.getAllByText('Summary g1').length).toBeGreaterThan(0);
  await act(async () => paras.resolve(json({ error: 'busy', message: BUSY }, 503)));
  expect(await screen.findByText('Checking sentences…')).toBeTruthy();
  await act(async () => sents.resolve(ok([g1, s1])));
  expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).layer)).toEqual(['global', 'paragraphs', 'sentences']);
  expect(screen.getByText(BUSY)).toBeTruthy();
  expect(screen.getByText('Summary g1')).toBeTruthy();

  fetchMock.mockResolvedValueOnce(ok([g1, p1, s1]));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Summary p1');
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ draftId: DRAFT, layer: 'paragraphs' });
  expect(screen.queryByText(BUSY)).toBeNull();
});

test('Top 3 shows the three highest-ranked open items; Show all groups the rest by layer', () => {
  view();
  const top = screen.getByRole('region', { name: 'Top 3 priorities' });
  expect(within(top).getAllByRole('article').map((a) => a.id)).toEqual(['card-g1', 'card-p1', 'card-g2']);
  expect(screen.queryByText('Summary p2')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  const rest = screen.getByRole('region', { name: 'All feedback' });
  expect(within(rest).getByRole('heading', { name: 'Paragraph' })).toBeTruthy();
  expect(within(rest).getByText('Summary p2')).toBeTruthy();
  expect(within(rest).getByRole('heading', { name: 'Sentence' })).toBeTruthy();
  expect(within(rest).queryByText('Summary g1')).toBeNull();
});

test('sentence items are collapsed with a count while a global item is open', async () => {
  view();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(screen.queryByText('Possible typo')).toBeNull();
  const more = screen.getByRole('button', { name: 'Show 1 sentence note' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);
  expect(screen.getByText('Possible typo')).toBeTruthy();
  fireEvent.click(within(card('s1')).getByRole('button', { name: 'Show suggestion' }));
  expect(within(card('s1')).getByText('there.')).toBeTruthy();
  cleanup();

  view({ items: [{ ...g1, status: 'got_it' }, p1, p2, item('p3', { paragraph_index: 2, quote: 'abruptly' }), s1] }); // no global item open
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(screen.getByText('Possible typo')).toBeTruthy();
});

test('clicking a highlight focuses its card; Show in essay focuses the highlight', async () => {
  view();
  const mark = document.getElementById('hl-g1')!;
  expect(mark.tagName).toBe('MARK');
  expect(within(mark).getByText('Big picture')).toBeTruthy();
  expect(mark.textContent).toMatch(/^Big picture: \S/); // label and quote must not run together for screen readers
  fireEvent.click(mark);
  await waitFor(() => expect(document.activeElement).toBe(card('g1')));
  fireEvent.click(within(card('g1')).getByRole('button', { name: 'Show in essay' }));
  expect(document.activeElement).toBe(mark);

  // A collapsed sentence item opens before its card takes focus.
  fireEvent.click(document.getElementById('hl-s1')!);
  await waitFor(() => expect(document.activeElement).toBe(card('s1')));
  expect(within(document.getElementById('hl-strength-0')!).getByText('Strength')).toBeTruthy();
  expect(within(card('g2')).getByText('Covers the whole essay')).toBeTruthy();
});

test('Show next hint reveals level 1, then 2, then requests level 3', async () => {
  view();
  const c = card('g1');
  const next = () => fireEvent.click(within(c).getByRole('button', { name: 'Show next hint' }));
  next();
  expect(within(c).getByText('Hint one g1')).toBeTruthy();
  expect(logViewedLevel).toHaveBeenLastCalledWith('g1', 1);
  next();
  expect(within(c).getByText('Hint two g1')).toBeTruthy();
  expect(logViewedLevel).toHaveBeenLastCalledWith('g1', 2);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(json({ text: 'Each claim needs a reason.' }));
  next();
  expect(await within(c).findByText('Each claim needs a reason.')).toBeTruthy();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/essays/hint');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ itemId: 'g1', level: 3 });
});

test('level 5 at the cap shows the rewrite-limit message', async () => {
  const atFour = { ...p1, highest_level: 4, hints: ['h1', 'h2', 'h3', 'h4'] };
  view({ items: [atFour], rewritesUsed: 3 });
  fireEvent.click(within(card('p1')).getByRole('button', { name: 'Show next hint' }));
  expect(within(card('p1')).getByText("You've used this draft's 3 suggested rewrites.")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  cleanup();

  view({ items: [atFour], rewritesUsed: 1 });
  expect(within(card('p1')).getByText('Next is a suggested rewrite. 2 of 3 left for this draft.')).toBeTruthy();
  fetchMock.mockResolvedValueOnce(json({ text: 'the evidence weakly' }));
  fireEvent.click(within(card('p1')).getByRole('button', { name: 'Show next hint' }));
  expect(await within(card('p1')).findByText('the evidence weakly')).toBeTruthy();
  expect(within(card('p1')).getByText('1 of 3 suggested rewrites left for this draft.')).toBeTruthy();
});

const reply = (body: Record<string, unknown>) => json({ verdict: null, revisedSummary: null, ...body });
const sent = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);

test('Ask a question needs a message, posts it, and announces the reply without changing the card', async () => {
  view();
  const c = card('p1');
  fireEvent.click(within(c).getByRole('button', { name: 'Ask a question' }));
  const field = within(c).getByLabelText('Ask about this');
  expect(document.activeElement).toBe(field);
  fireEvent.click(within(c).getByRole('button', { name: 'Send' }));
  expect(within(c).getByRole('alert').textContent).toContain('Add a short message first.');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(reply({ reply: 'Evidence is a fact, statistic or source.' }));
  fireEvent.change(field, { target: { value: 'What counts as evidence?' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Send' }));
  expect(await within(c).findByText('Evidence is a fact, statistic or source.')).toBeTruthy();
  expect(sent()).toEqual({ itemId: 'p1', kind: 'question', message: 'What counts as evidence?' });
  expect(within(c).getByText('What counts as evidence?')).toBeTruthy();
  expect(within(c).getByRole('button', { name: 'Got it' })).toBeTruthy();
});

test('a withdraw verdict marks the card withdrawn and it leaves Top 3', async () => {
  view();
  const top = screen.getByRole('heading', { name: 'Top 3 priorities' }).closest('section')!;
  expect(within(top).getByText('Summary g1')).toBeTruthy();
  const c = card('g1');
  fireEvent.click(within(c).getByRole('button', { name: 'I disagree' }));
  fetchMock.mockResolvedValueOnce(reply({ reply: 'You are right, your thesis is specific.', verdict: 'withdraw' }));
  fireEvent.change(within(c).getByLabelText("Why doesn't this fit?"), { target: { value: 'My thesis names three reasons.' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(within(top).queryByText('Summary g1')).toBeNull());
  expect(sent()).toMatchObject({ itemId: 'g1', kind: 'dispute' });
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(within(card('g1')).getByText('Withdrawn after your explanation')).toBeTruthy();
});

test('a modify verdict shows Updated: above the original summary and marks the card Disputed', async () => {
  view();
  const c = card('p1');
  fireEvent.click(within(c).getByRole('button', { name: 'I disagree' }));
  fetchMock.mockResolvedValueOnce(reply({ reply: 'Partly.', verdict: 'modify', revisedSummary: 'Explain how the source backs the claim.' }));
  fireEvent.change(within(c).getByLabelText("Why doesn't this fit?"), { target: { value: 'I cite a source.' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Send' }));
  expect(await within(c).findByText('Updated: Explain how the source backs the claim.')).toBeTruthy();
  expect(within(c).getByText('Summary p1')).toBeTruthy();
  expect(within(c).getByText('Disputed')).toBeTruthy();
});

test('the thread limit shows its message; a saved thread shows on load', async () => {
  view({ threads: { p1: [{ role: 'student', kind: 'question', text: 'Earlier question?', verdict: null }, { role: 'coach', kind: 'question', text: 'Earlier answer.', verdict: null }] } });
  const c = card('p1');
  expect(within(c).getByText('Earlier answer.')).toBeTruthy();
  fireEvent.click(within(c).getByRole('button', { name: 'Ask a question' }));
  fetchMock.mockResolvedValueOnce(json({ error: 'thread_limit', message: "That's as far as I can take this one. Try the hint ladder, or mark it Got it." }, 409));
  fireEvent.change(within(c).getByLabelText('Ask about this'), { target: { value: 'More?' } });
  fireEvent.click(within(c).getByRole('button', { name: 'Send' }));
  expect((await within(c).findByRole('alert')).textContent).toContain("That's as far as I can take this one.");
});

test('low-confidence score reads Estimate; show_scores false hides scores', () => {
  view();
  const scores = screen.getByRole('region', { name: 'Rubric scores' });
  expect(within(scores).getByText('Estimate')).toBeTruthy();
  expect(within(scores).getAllByText(/of 4/)).toHaveLength(2);
  expect(within(scores).getByText('The claim is broad.')).toBeTruthy();
  cleanup();
  view({ showScores: false });
  expect(screen.queryByRole('region', { name: 'Rubric scores' })).toBeNull();
  expect(screen.queryByText('Estimate')).toBeNull();
});

test('safety_concern shows the support card first', () => {
  view({ analysis: analysis({ safety_concern: true }) });
  const panel = screen.getByRole('region', { name: 'Feedback' });
  const first = within(panel).getAllByRole('heading')[0];
  expect(first.closest('section')!.textContent).toContain("It sounds like you're going through something hard. You don't have to handle it alone.");
  expect(within(panel).getByText(/1553/)).toBeTruthy();
  expect(within(panel).getByRole('link', { name: /findahelpline\.com/ }).getAttribute('href')).toBe('https://findahelpline.com');
});

test('focus mode steps through Top 3 with keyboard only', async () => {
  view();
  const start = screen.getByRole('button', { name: 'Start focus mode' });
  start.focus();
  press();
  await waitFor(() => expect(document.activeElement).toBe(card('g1')));
  expect(screen.getByText('0 of 3 priorities addressed')).toBeTruthy();
  expect(document.querySelector('[data-paragraph="0"]')!.getAttribute('data-dimmed')).toBe('false');
  expect(document.querySelector('[data-paragraph="1"]')!.getAttribute('data-dimmed')).toBe('true');
  expect(screen.queryByRole('region', { name: 'Top 3 priorities' })).toBeNull();

  within(card('g1')).getByRole('button', { name: 'Got it' }).focus();
  press();
  await waitFor(() => expect(document.activeElement).toBe(card('p1')));
  expect(markGotIt).toHaveBeenCalledWith('g1');
  expect(screen.getByText('1 of 3 priorities addressed')).toBeTruthy();

  within(card('p1')).getByRole('button', { name: 'Skip' }).focus();
  press();
  await waitFor(() => expect(document.activeElement).toBe(card('g2')));

  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start focus mode' })));
  expect(screen.getByRole('region', { name: 'Top 3 priorities' })).toBeTruthy();
});

test('a missing part puts the alignment checklist before Top 3; labels are text', () => {
  view({ analysis: analysis({ prompt_alignment: [
    { part: 'Take a position', status: 'addressed', note: 'Clear stance.' },
    { part: 'Use two sources', status: 'missing', note: 'No sources yet.' },
    { part: 'Address a counterargument', status: 'partial', note: 'Brief mention.' },
  ] }) });
  const checklist = screen.getByRole('region', { name: 'What the assignment asks' });
  expect(within(checklist).getByText('Not yet')).toBeTruthy();
  expect(within(checklist).getByText('Covered')).toBeTruthy();
  expect(within(checklist).getByText('Partly covered')).toBeTruthy();
  const top = screen.getByRole('heading', { name: 'Top 3 priorities' });
  expect(checklist.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('all parts covered puts the checklist after Top 3; no alignment means no checklist', () => {
  view({ analysis: analysis({ prompt_alignment: [{ part: 'Take a position', status: 'addressed', note: '' }] }) });
  const checklist = screen.getByRole('region', { name: 'What the assignment asks' });
  const top = screen.getByRole('heading', { name: 'Top 3 priorities' });
  expect(checklist.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  cleanup();
  view();
  expect(screen.queryByRole('region', { name: 'What the assignment asks' })).toBeNull();
});

test('the paragraph outline lists each line with its flag label and links to the paragraph', () => {
  view({ outline: [{ paragraph_index: 0, summary: 'States the thesis', flag: null }, { paragraph_index: 1, summary: 'Gives evidence', flag: 'repeats' }] });
  const outline = screen.getByRole('region', { name: 'Paragraph outline' });
  const link = within(outline).getByRole('link', { name: /P2: Gives evidence/ });
  expect(link.getAttribute('href')).toBe('#para-1');
  expect(within(outline).getByText('Repeats an earlier point')).toBeTruthy();
  expect(document.getElementById('para-1')?.textContent).toContain('evidence badly');
});
