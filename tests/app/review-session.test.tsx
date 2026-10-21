import 'fake-indexeddb/auto';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReviewCard } from '@/app/(app)/study/review/session';
import { db } from '@/review/store';

// fake IndexedDB writes are slow when the whole suite runs in parallel; the 1 s default flakes
configure({ asyncUtilTimeout: 5000 });

const getEmbedder = vi.fn();
vi.mock('@/lib/embed/embed', () => ({ getEmbedder: () => getEmbedder() }));
const syncOutbox = vi.fn();
vi.mock('@/review/sync', () => ({ syncOutbox: (...a: unknown[]) => syncOutbox(...a) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: vi.fn() }) }));

import { ReviewSession } from '@/app/(app)/study/review/session';

const card = (id: string, over: Partial<ReviewCard> = {}): ReviewCard => ({
  id, deckId: 'd', type: 'basic', importance: 2, state: null, front: `Front ${id}`, back: 'electron transport chain', keyPoints: [], ...over,
});
const why = card('w', { type: 'why', front: 'Why does ATP synthase spin?', back: 'Protons flow down their gradient', keyPoints: ['proton gradient'] });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const llm = { score: 0.8, hit: ['proton gradient'], missed: [], misconception: null, feedback: 'You named the gradient.', suggested_rating: 'good' };

const fetchMock = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  getEmbedder.mockResolvedValue(null);
  syncOutbox.mockResolvedValue({ sent: 0, regraded: 0, failed: 0 });
  await Promise.all([db.outbox.clear(), db.states.clear(), db.cards.clear()]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const start = async (cards: ReviewCard[]) => {
  render(<ReviewSession cards={cards} minutes={20} newIntroducedToday={0} examDates={{}} />);
  return (await screen.findByLabelText('Your answer')) as HTMLTextAreaElement;
};
const answer = async (field: HTMLTextAreaElement, text: string) => {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};
// a slow answer: Easy needs under 10 s, so a typo answered after 12 s is Good
const after12s = () => { const t = Date.now() + 12000; vi.spyOn(Date, 'now').mockReturnValue(t); };
const rating = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const outbox = () => db.outbox.toArray();

test('typo answer shows Good pre-selected and Suggested label, no grade request', async () => {
  const field = await start([card('a'), card('b')]);
  expect(screen.getByText('Card 1 of 2')).toBeTruthy();
  after12s();
  await answer(field, 'electron transport chian');
  await waitFor(() => expect(rating('Good').textContent).toContain('Suggested'));
  expect(rating('Good').getAttribute('aria-pressed')).toBe('true');
  expect(rating('Hard').textContent).not.toContain('Suggested');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText('electron transport chian')).toBeTruthy();
});

test('why card shows Checking your answer then the LLM feedback', async () => {
  let release!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((r) => { release = r; }));
  const field = await start([why]);
  await answer(field, 'protons move through it');
  expect(await screen.findByText('Checking your answer…')).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'w', answer: 'protons move through it' });
  await act(async () => release(json(200, { result: llm, cached: false })));
  expect(await screen.findByText('You named the gradient.')).toBeTruthy();
  expect(screen.getByText('✓ Got this: proton gradient')).toBeTruthy();
  expect(rating('Good').textContent).toContain('Suggested');
});

test('grade 503 shows self-grade prompt and queues a regrade', async () => {
  fetchMock.mockResolvedValueOnce(json(503, { error: 'busy', message: 'x' }));
  const field = await start([why]);
  await answer(field, 'no idea really');
  expect(await screen.findByText("Couldn't check this one right now. How did you do?")).toBeTruthy();
  expect(screen.queryByText(/Suggested/)).toBeNull();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  const [row] = await outbox();
  expect(row).toMatchObject({ needsRegrade: 1, review: { grade_source: 'self', final_rating: 2, suggested_rating: null, answer_text: 'no idea really' } });
});

test('pressing 1 overrides the suggestion to Again', async () => {
  const field = await start([card('a'), card('b')]);
  after12s();
  await answer(field, 'electron transport chian');
  await waitFor(() => expect(rating('Good').textContent).toContain('Suggested'));
  fireEvent.keyDown(window, { key: '1' });
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  const [row] = await outbox();
  expect(row.review).toMatchObject({ final_rating: 1, suggested_rating: 3, grade_source: 'fuzzy', card_id: 'a' });
  expect(row.needsRegrade).toBe(0);
  expect((await db.states.get('a'))?.reps).toBe(1);
});

test('Show answer flips the card and the student rates it', async () => {
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('electron transport chain')).toBeTruthy();
  fireEvent.click(rating('Easy'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  expect((await outbox())[0].review).toMatchObject({ grade_source: 'self', final_rating: 4, answer_text: null, suggested_rating: null });
});

test('summary shows count, accuracy, and next review', async () => {
  const field = await start([card('a'), card('b')]);
  await answer(field, 'electron transport chain');
  await waitFor(() => rating('Easy'));
  fireEvent.keyDown(window, { key: '3' });
  await answer(await screen.findByLabelText('Your answer') as HTMLTextAreaElement, 'no clue');
  await waitFor(() => rating('Again'));
  fireEvent.keyDown(window, { key: '1' });
  expect(await screen.findByRole('heading', { name: 'Session done' })).toBeTruthy();
  expect(screen.getByText('2 cards reviewed')).toBeTruthy();
  expect(screen.getByText('Accuracy: 50%')).toBeTruthy();
  expect(screen.getByText(/^Next review: today, about 2 cards$/)).toBeTruthy();
  await waitFor(() => expect(syncOutbox).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Do more' })).toBeTruthy();
});

test('keyboard only: Enter checks, digits rate, focus returns to the answer field', async () => {
  const field = await start([card('a'), card('b')]);
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, { target: { value: 'electron transport chain' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() => expect(rating('Easy').textContent).toContain('Suggested'));
  fireEvent.keyDown(window, { key: '3' });
  expect(await screen.findByText('Card 2 of 2')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Your answer')));
});

test('no cards due shows a calm empty state', async () => {
  render(<ReviewSession cards={[]} minutes={20} newIntroducedToday={0} examDates={{}} />);
  expect(await screen.findByText('Nothing to review right now.')).toBeTruthy();
});
