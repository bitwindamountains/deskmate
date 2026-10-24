import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const setStatus = vi.fn();
const removeCards = vi.fn();
const saveCard = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({
  setStatus: (...a: unknown[]) => setStatus(...a),
  removeCards: (...a: unknown[]) => removeCards(...a),
  saveCard: (...a: unknown[]) => saveCard(...a),
}));

import { CardList, type EditorCard } from '@/app/(app)/study/deck/[deckId]/card-list';

const card = (id: string, over: Partial<EditorCard> = {}): EditorCard => ({
  id, type: 'basic', front: `Front ${id}`, back: `Back ${id}`, concept: 'Cells', status: 'kept', lapses: 0, sourceId: 's1', ...over,
});
const cards = [
  card('a', { front: 'What is ATP?', concept: 'Energy' }),
  card('b', { front: 'Mitochondria role', back: 'Makes ATP', type: 'why', status: 'suspended' }),
  card('c', { front: 'Cell wall', lapses: 4 }),
  card('d', { front: 'Ribosome', status: 'pending' }),
];

beforeEach(() => {
  setStatus.mockResolvedValue(undefined);
  removeCards.mockResolvedValue(undefined);
  saveCard.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const rows = () => screen.queryAllByRole('listitem');
const box = (front: string) => screen.getByRole('checkbox', { name: front }) as HTMLInputElement;

test('each row shows its sides, type, concept, status and slipping', () => {
  render(<CardList cards={cards} />);
  expect(rows()).toHaveLength(4);
  const b = within(rows()[1]);
  expect(b.getByText('Makes ATP')).toBeTruthy();
  expect(b.getByText('Why · Cells · Suspended')).toBeTruthy();
  expect(within(rows()[2]).getByText('Slipping')).toBeTruthy();
  expect(within(rows()[0]).queryByText('Slipping')).toBeNull();
  // pending cards go to triage instead of offering suspend
  const d = within(rows()[3]);
  expect(d.getByRole('link', { name: 'Sort this card' }).getAttribute('href')).toBe('/study/triage/s1');
  expect(d.queryByRole('button', { name: 'Suspend' })).toBeNull();
});

test('search and filters narrow the list; Select all shown selects only visible rows', async () => {
  render(<CardList cards={cards} />);
  fireEvent.change(screen.getByLabelText('Search cards'), { target: { value: 'atp' } });
  expect(rows()).toHaveLength(2); // front of a, back of b
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
  expect(rows()).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search cards'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Concept'), { target: { value: 'cells' } });
  expect(rows()).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'basic' } });
  expect(rows()).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }));
  expect(box('Cell wall').checked).toBe(true);
  expect(box('Ribosome').checked).toBe(true);
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: '' } });
  expect(box('Mitochondria role').checked).toBe(false);
  fireEvent.change(screen.getByLabelText('Concept'), { target: { value: '' } });
  expect(box('What is ATP?').checked).toBe(false);
  expect(screen.getByText('2 selected')).toBeTruthy();

  // the pending card is left for triage; only the kept one is suspended
  fireEvent.click(screen.getByRole('button', { name: 'Suspend selected' }));
  await waitFor(() => expect(setStatus).toHaveBeenCalledWith([cards[2].id], 'suspended'));
  expect(await within(rows()[2]).findByText('Q&A · Cells · Suspended')).toBeTruthy();
});

test('a suspended card can be unsuspended from its row', async () => {
  render(<CardList cards={cards} />);
  fireEvent.click(within(rows()[1]).getByRole('button', { name: 'Unsuspend' }));
  await waitFor(() => expect(setStatus).toHaveBeenCalledWith(['b'], 'kept'));
  expect(await within(rows()[1]).findByText('Why · Cells · Kept')).toBeTruthy();
});

test('delete asks first and removes the cards', async () => {
  render(<CardList cards={cards} />);
  fireEvent.click(box('What is ATP?'));
  fireEvent.click(box('Cell wall'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  expect(screen.getByText('Delete 2 cards? Their review history goes too.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(removeCards).not.toHaveBeenCalled();
  expect(rows()).toHaveLength(4);

  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(rows()).toHaveLength(2));
  expect(removeCards).toHaveBeenCalledWith(['a', 'c']);
  expect(screen.getByRole('status').textContent).toBe('Deleted 2 cards.');
});

test('a failed delete keeps the cards and says so', async () => {
  removeCards.mockRejectedValue(new Error('nope'));
  render(<CardList cards={cards} />);
  fireEvent.click(box('What is ATP?'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't save that change. Try again.");
  expect(rows()).toHaveLength(4);
});

test('inline edit saves front and back, and rejects an empty side', async () => {
  render(<CardList cards={cards} />);
  fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Front'), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toBe('Front and back need some text.');
  fireEvent.change(screen.getByLabelText('Front'), { target: { value: ' What is ADP? ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveCard).toHaveBeenCalledWith('a', { front: 'What is ADP?', back: 'Back a' }));
  expect(await screen.findByRole('checkbox', { name: 'What is ADP?' })).toBeTruthy();
});

test('Suggest a rewrite fills the edit form; nothing is saved until Save (B-S8)', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ suggestion: { front: 'Where is ATP made?', back: 'Mitochondria' } }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<CardList cards={cards} />);
  fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a rewrite' }));
  await waitFor(() => expect((screen.getByLabelText('Front') as HTMLTextAreaElement).value).toBe('Where is ATP made?'));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'a' });
  expect(screen.getByText('Suggested rewrite. Change anything, then Save. Cancel keeps the card as it was.')).toBeTruthy();
  expect(saveCard).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('a refused suggestion shows its reason in the form', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'This card has no source passage to check a rewrite against. Edit it yourself instead.' }), { status: 409 })));
  render(<CardList cards={cards} />);
  fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a rewrite' }));
  expect((await screen.findByRole('alert')).textContent).toBe('This card has no source passage to check a rewrite against. Edit it yourself instead.');
  vi.unstubAllGlobals();
});
