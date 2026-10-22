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
  importCsv.mockResolvedValue({ ok: true, added: 3, skippedRows: [3, 7], inDeck: 2, inFile: 1 });
  render(<Transfer deckId={D} />);
  expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(`/api/decks/${D}/export?format=csv`);
  expect(screen.getByRole('link', { name: 'Export for Anki' }).getAttribute('href')).toBe(`/api/decks/${D}/export?format=anki`);
  const file = new File(['front,back\nQ,A'], 'cards.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Import cards from a CSV file'), { target: { files: [file] } });
  expect(await screen.findByText('Added 3 cards. 2 already in this deck. 1 repeated in the file. Skipped rows 3 and 7: a front or back was empty or over 500 characters.')).toBeTruthy();
  expect(importCsv).toHaveBeenCalledWith(D, 'front,back\nQ,A');
  expect(refresh).toHaveBeenCalled();
});

test('an import error is shown as an alert', async () => {
  importCsv.mockResolvedValue({ ok: false, message: 'The first row needs "front" and "back" columns.' });
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV file'), { target: { files: [new File(['x'], 'x.csv')] } });
  expect((await screen.findByRole('alert')).textContent).toBe('The first row needs "front" and "back" columns.');
});

test('a Windows-1252 file from Excel keeps its accented letters', async () => {
  importCsv.mockResolvedValue({ ok: true, added: 1, skippedRows: [], inDeck: 0, inFile: 0 });
  render(<Transfer deckId={D} />);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // "front,back\nAcción,Mañana" as Windows-1252: ó is 0xF3 and ñ is 0xF1 (invalid as UTF-8)
  const bytes = new Uint8Array([...ascii('front,back\nAcci'), 0xf3, ...ascii('n,Ma'), 0xf1, ...ascii('ana')]);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV file'), { target: { files: [new File([bytes], 'x.csv')] } });
  await screen.findByText(/Added 1 card/);
  expect(importCsv).toHaveBeenCalledWith(D, 'front,back\nAcción,Mañana');
});


test('a file over 1 MB is refused before reading, and the same file can be picked again', async () => {
  render(<Transfer deckId={D} />);
  const input = screen.getByLabelText('Import cards from a CSV file') as HTMLInputElement;
  const big = new File(['x'.repeat(1_000_001)], 'big.csv');
  fireEvent.change(input, { target: { files: [big] } });
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a CSV under 1 MB.');
  expect(importCsv).not.toHaveBeenCalled();
  expect(input.value).toBe('');
});
