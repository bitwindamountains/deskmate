import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const addCard = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({ addCard: (...a: unknown[]) => addCard(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { AddCard } from '@/app/(app)/study/deck/[deckId]/add-card';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const D = '11111111-1111-4111-8111-111111111111';

function fill(q: string, a: string, c = '') {
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: q } });
  fireEvent.change(screen.getByLabelText('Answer'), { target: { value: a } });
  fireEvent.change(screen.getByLabelText('Concept (optional)'), { target: { value: c } });
  fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
}

test('adding a card saves it, clears the fields and puts the cursor back in Question', async () => {
  addCard.mockResolvedValue({ ok: true, added: 1, skippedRows: [], inDeck: 0, inFile: 0 });
  render(<AddCard deckId={D} />);
  fill('What is osmosis?', 'Water moving across a membrane', 'Cells');
  expect((await screen.findByRole('status')).textContent).toBe('Added.');
  expect(addCard).toHaveBeenCalledWith(D, { front: 'What is osmosis?', back: 'Water moving across a membrane', concept: 'Cells' });
  expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe('');
  expect((screen.getByLabelText('Answer') as HTMLTextAreaElement).value).toBe('');
  expect(document.activeElement).toBe(screen.getByLabelText('Question'));
  expect(refresh).toHaveBeenCalled();
});

test('a duplicate says so and keeps the fields', async () => {
  addCard.mockResolvedValue({ ok: true, added: 0, skippedRows: [], inDeck: 1, inFile: 0 });
  render(<AddCard deckId={D} />);
  fill('Q', 'A');
  expect((await screen.findByRole('status')).textContent).toBe('That card is already in this deck.');
  expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe('Q');
  expect(refresh).not.toHaveBeenCalled();
});

test('an error is shown as an alert', async () => {
  addCard.mockResolvedValue({ ok: false, message: "We couldn't find that deck." });
  render(<AddCard deckId={D} />);
  fill('Q', 'A');
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't find that deck.");
});

test('a failed request is shown as an alert', async () => {
  addCard.mockRejectedValue(new Error('network'));
  render(<AddCard deckId={D} />);
  fill('Q', 'A');
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't add that card. Try again.");
});
