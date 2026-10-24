import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CardRow } from '@/lib/generate/generate-chunk';

const setCardStatus = vi.fn();
const editCard = vi.fn();
const saveEmbeddings = vi.fn();
vi.mock('@/app/(app)/study/triage/actions', () => ({
  setCardStatus: (...a: unknown[]) => setCardStatus(...a),
  editCard: (...a: unknown[]) => editCard(...a),
  saveEmbeddings: (...a: unknown[]) => saveEmbeddings(...a),
}));
const getEmbedder = vi.fn();
vi.mock('@/lib/embed/embed', () => ({ getEmbedder: () => getEmbedder() }));

import { Triage } from '@/app/(app)/study/triage/[sourceId]/triage';

const SRC = '11111111-1111-4111-8111-111111111111';
const card = (id: string, front = `Front ${id}`): CardRow => ({
  id, deck_id: 'd', source_chunk_id: 'c', type: 'basic', front, back: `Back ${id}`, key_points: [], source_quote: `quote ${id}`,
  concept: 'x', bloom_level: 'remember', importance: 2, status: 'pending', page_start: 3,
});
const ok = (cards: CardRow[]) => new Response(JSON.stringify({ cards, droppedUngrounded: 0, alreadyGenerated: false }), { status: 200, headers: { 'content-type': 'application/json' } });
const err = (status: number, error: string, message: string) => new Response(JSON.stringify({ error, message }), { status, headers: { 'content-type': 'application/json' } });
const BUSY = 'The AI service is busy. Your material is saved; try again in a few minutes.';
const QUOTA = "You've used today's 3 card generations. They reset in about 7 hours.";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  setCardStatus.mockResolvedValue(undefined);
  editCard.mockResolvedValue(undefined);
  saveEmbeddings.mockResolvedValue(undefined);
  getEmbedder.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

const live = () => screen.getByRole('status');
const front = () => screen.getByRole('heading', { level: 2 }).textContent;

test('cards from two chunks appear in order and progress reads part 2 of 2', async () => {
  let release!: (r: Response) => void;
  fetchMock.mockResolvedValueOnce(ok([card('a'), card('b')])).mockReturnValueOnce(new Promise((r) => { release = r; }));
  render(<Triage sourceId={SRC} todo={[0, 1]} pending={[]} existing={[]} />);
  expect(await screen.findByText('Making cards… part 2 of 2')).toBeTruthy();
  expect(front()).toBe('Front a');
  expect(screen.getByText('Q&A')).toBeTruthy();
  expect(screen.getByText('From page 3: quote a')).toBeTruthy();
  await act(async () => release(ok([card('c')])));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ sourceId: SRC, position: 1 });
  await waitFor(() => expect(screen.queryByText(/Making cards/)).toBeNull());
  expect(screen.getByText('3 cards to review')).toBeTruthy();
});

test('ArrowRight keeps the current card and announces it', async () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a'), card('b')]} existing={[]} />);
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(setCardStatus).toHaveBeenCalledWith(['a'], 'kept', undefined);
  expect(live().textContent).toBe('Kept. 1 left.');
  await waitFor(() => expect(front()).toBe('Front b'));
});

test('Discard with the Wrong chip sends reason wrong', async () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a'), card('b')]} existing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wrong' }));
  expect(setCardStatus).toHaveBeenCalledWith(['a'], 'discarded', 'wrong');
  expect(live().textContent).toBe('Discarded. 1 left.');
});

test('Edit saves trimmed text and refuses an empty front', async () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a')]} existing={[]} />);
  fireEvent.keyDown(window, { key: 'e' });
  fireEvent.change(screen.getByLabelText('Front'), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toContain('Front and back need some text.');
  expect(editCard).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Front'), { target: { value: ' New front ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(editCard).toHaveBeenCalledWith('a', { front: 'New front', back: 'Back a' });
  await waitFor(() => expect(front()).toBe('New front'));
});

test('503 keeps existing cards and Try again resumes at the failed chunk', async () => {
  fetchMock.mockResolvedValueOnce(ok([card('a')])).mockResolvedValueOnce(err(503, 'busy', BUSY)).mockResolvedValueOnce(ok([card('b')]));
  render(<Triage sourceId={SRC} todo={[0, 4]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain(BUSY);
  expect(front()).toBe('Front a');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText('2 cards to review')).toBeTruthy());
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ sourceId: SRC, position: 4 });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('429 shows the quota message', async () => {
  fetchMock.mockResolvedValueOnce(err(429, 'quota', QUOTA));
  render(<Triage sourceId={SRC} todo={[0, 1]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain(QUOTA);
  expect(screen.getByRole('link', { name: 'Back to Study' }).getAttribute('href')).toBe('/study');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('401 asks the user to sign in again', async () => {
  fetchMock.mockResolvedValueOnce(err(401, 'unauthorized', 'Please sign in again.'));
  render(<Triage sourceId={SRC} todo={[0]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Your session ended. Sign in again.');
  expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(`/login?next=${encodeURIComponent(`/study/triage/${SRC}`)}`);
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test('a redirected response asks the user to sign in again', async () => {
  const res = new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  Object.defineProperty(res, 'redirected', { value: true });
  fetchMock.mockResolvedValueOnce(res);
  render(<Triage sourceId={SRC} todo={[0]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Your session ended. Sign in again.');
});

test('a non-JSON 500 shows the busy message with Try again', async () => {
  fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500, headers: { 'content-type': 'text/plain' } }));
  render(<Triage sourceId={SRC} todo={[0]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain(BUSY);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('a network error shows the busy message with Try again', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<Triage sourceId={SRC} todo={[0]} pending={[]} existing={[]} />);
  expect((await screen.findByRole('alert')).textContent).toContain(BUSY);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('unmounting mid-run aborts generation and requests nothing more', async () => {
  let release!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((r) => { release = r; })).mockResolvedValue(ok([]));
  const { unmount } = render(<Triage sourceId={SRC} todo={[0, 1, 2]} pending={[]} existing={[]} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  unmount();
  expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  await act(async () => release(ok([card('a')])));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('after the last card, focus moves to Done reviewing', async () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a')]} existing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Done reviewing' })));
});

test('auto-repeated keys are ignored', () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a'), card('b')]} existing={[]} />);
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
  expect(setCardStatus).not.toHaveBeenCalled();
});

test('Keep all keeps every pending card', async () => {
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a'), card('b'), card('c')]} existing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Keep all' }));
  expect(setCardStatus).toHaveBeenCalledWith(['a', 'b', 'c'], 'kept', undefined);
  expect(live().textContent).toBe('Kept all 3 cards.');
  expect(screen.getByRole('link', { name: 'Done reviewing' }).getAttribute('href')).toBe('/study');
});

test('duplicates in a batch are discarded and announced', async () => {
  // identical text -> identical vector -> duplicate of the existing kept card
  getEmbedder.mockResolvedValue(async (texts: string[]) => texts.map((t) => (t.includes('same') ? [1, 0] : [0, 1])));
  fetchMock.mockResolvedValueOnce(ok([card('a', 'same'), card('b', 'other')]));
  render(<Triage sourceId={SRC} todo={[0]} pending={[]} existing={[{ id: 'k', front: 'same', back: '', embedding: [1, 0] }]} />);
  await waitFor(() => expect(live().textContent).toBe('Skipped 1 duplicate.'));
  expect(setCardStatus).toHaveBeenCalledWith(['a'], 'discarded', 'duplicate');
  expect(saveEmbeddings).toHaveBeenCalledWith([{ id: 'a', embedding: [1, 0] }, { id: 'b', embedding: [0, 1] }]);
  expect(front()).toBe('other');
});

test('Improve this card opens the edit form with the suggested rewrite; Save stores it, nothing is saved before', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ suggestion: { front: 'Where does glycolysis happen?', back: 'In the cytoplasm' } }), { status: 200 }));
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a')]} existing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Improve this card' }));
  expect(await screen.findByText('Suggested rewrite. Change anything, then Save. Cancel keeps your card as it was.')).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'a' });
  expect((screen.getByLabelText('Front') as HTMLTextAreaElement).value).toBe('Where does glycolysis happen?');
  expect(editCard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(editCard).toHaveBeenCalledWith('a', { front: 'Where does glycolysis happen?', back: 'In the cytoplasm' }));
});

test('a refused improvement shows its reason and keeps the card', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no_source', message: 'This card has no source passage to check a rewrite against. Edit it yourself instead.' }), { status: 409 }));
  render(<Triage sourceId={SRC} todo={[]} pending={[card('a')]} existing={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Improve this card' }));
  expect((await screen.findByRole('alert')).textContent).toBe('This card has no source passage to check a rewrite against. Edit it yourself instead.');
  expect(front()).toBe('Front a');
});
