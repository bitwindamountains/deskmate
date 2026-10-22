import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const importCsv = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({ importCsv: (...a: unknown[]) => importCsv(...a) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import { Transfer } from '@/app/(app)/study/deck/[deckId]/transfer';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const D = '11111111-1111-4111-8111-111111111111';

test('the deck page offers Import CSV, Export CSV and Export for Anki', async () => {
  importCsv.mockResolvedValue({ ok: true, added: 3, skipped: 1 });
  render(<Transfer deckId={D} />);
  expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(`/api/decks/${D}/export?format=csv`);
  expect(screen.getByRole('link', { name: 'Export for Anki' }).getAttribute('href')).toBe(`/api/decks/${D}/export?format=anki`);
  const file = new File(['front,back\nQ,A'], 'cards.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Import cards from a CSV file'), { target: { files: [file] } });
  expect(await screen.findByText('Added 3 cards. Skipped 1 row without a front and back.')).toBeTruthy();
  expect(importCsv).toHaveBeenCalledWith(D, 'front,back\nQ,A');
  expect(refresh).toHaveBeenCalled();
});

test('an import error is shown as an alert', async () => {
  importCsv.mockResolvedValue({ ok: false, message: 'The first row needs "front" and "back" columns.' });
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV file'), { target: { files: [new File(['x'], 'x.csv')] } });
  expect((await screen.findByRole('alert')).textContent).toBe('The first row needs "front" and "back" columns.');
});
