import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const importCsv = vi.fn();
const importAnki = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({ importCsv: (...a: unknown[]) => importCsv(...a), importAnki: (...a: unknown[]) => importAnki(...a) }));
const readApkg = vi.fn();
vi.mock('@/lib/cards/apkg', () => ({ readApkg: (...a: unknown[]) => readApkg(...a) }));
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
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [file] } });
  expect(await screen.findByText('Added 3 cards. 2 already in this deck. 1 repeated in the file. Skipped rows 3 and 7: a front or back was empty or over 500 characters.')).toBeTruthy();
  expect(importCsv).toHaveBeenCalledWith(D, 'front,back\nQ,A');
  expect(refresh).toHaveBeenCalled();
});

test('an import error is shown as an alert', async () => {
  importCsv.mockResolvedValue({ ok: false, message: 'The first row needs "front" and "back" columns.' });
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [new File(['x'], 'x.csv')] } });
  expect((await screen.findByRole('alert')).textContent).toBe('The first row needs "front" and "back" columns.');
});

test('a Windows-1252 file from Excel keeps its accented letters', async () => {
  importCsv.mockResolvedValue({ ok: true, added: 1, skippedRows: [], inDeck: 0, inFile: 0 });
  render(<Transfer deckId={D} />);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // "front,back\nAcción,Mañana" as Windows-1252: ó is 0xF3 and ñ is 0xF1 (invalid as UTF-8)
  const bytes = new Uint8Array([...ascii('front,back\nAcci'), 0xf3, ...ascii('n,Ma'), 0xf1, ...ascii('ana')]);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [new File([bytes], 'x.csv')] } });
  await screen.findByText(/Added 1 card/);
  expect(importCsv).toHaveBeenCalledWith(D, 'front,back\nAcción,Mañana');
});


test('a file over 1 MB is refused before reading, and the same file can be picked again', async () => {
  render(<Transfer deckId={D} />);
  const input = screen.getByLabelText('Import cards from a CSV or Anki file') as HTMLInputElement;
  const big = new File(['x'.repeat(1_000_001)], 'big.csv');
  fireEvent.change(input, { target: { files: [big] } });
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a CSV under 1 MB.');
  expect(importCsv).not.toHaveBeenCalled();
  expect(input.value).toBe('');
});

const ANKI = [{ front: 'Q1', back: 'A1', concept: '', type: 'basic' }, { front: 'Q2', back: 'A2', concept: '', type: 'basic' }];

test('an Anki package is read on the device and its cards imported', async () => {
  readApkg.mockResolvedValue({ cards: ANKI, skipped: 1 });
  importAnki.mockResolvedValue({ ok: true, added: 2, skippedRows: [], inDeck: 0, inFile: 0 });
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [new File([new Uint8Array([1])], 'deck.apkg')] } });
  expect(await screen.findByText('Added 2 cards. Skipped 1 note: a side was empty or over 500 characters.')).toBeTruthy();
  expect(readApkg).toHaveBeenCalledWith(expect.any(Uint8Array), '/vendor/sql-wasm-1.17.0.wasm');
  expect(importAnki).toHaveBeenCalledWith(D, ANKI);
  expect(importCsv).not.toHaveBeenCalled();
});

test('an unreadable Anki package is an alert and nothing is imported', async () => {
  readApkg.mockResolvedValue({ cards: [], skipped: 0, error: "That file isn't an Anki package (.apkg)." });
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [new File(['x'], 'x.apkg')] } });
  expect((await screen.findByRole('alert')).textContent).toBe("That file isn't an Anki package (.apkg).");
  expect(importAnki).not.toHaveBeenCalled();
});

test('an Anki package over 100 MB is refused before reading', async () => {
  render(<Transfer deckId={D} />);
  const big = new File(['x'], 'big.apkg');
  Object.defineProperty(big, 'size', { value: 100_000_001 });
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [big] } });
  expect((await screen.findByRole('alert')).textContent).toBe('Choose an Anki package under 100 MB.');
  expect(readApkg).not.toHaveBeenCalled();
});

test('a big Anki package is sent in batches that each fit the request limit, and the counts add up', async () => {
  const many = Array.from({ length: 1200 }, (_, i) => ({ front: `Q${i}`, back: 'A', concept: '', type: 'basic' }));
  readApkg.mockResolvedValue({ cards: many, skipped: 0 });
  importAnki.mockImplementation(async (_d: string, cards: unknown[]) => ({ ok: true, added: cards.length - 1, skippedRows: [], inDeck: 1, inFile: 0 }));
  render(<Transfer deckId={D} />);
  fireEvent.change(screen.getByLabelText('Import cards from a CSV or Anki file'), { target: { files: [new File(['x'], 'big.apkg')] } });
  expect(await screen.findByText('Added 1197 cards. 3 already in this deck.')).toBeTruthy();
  expect(importAnki.mock.calls.map((c) => (c[1] as unknown[]).length)).toEqual([500, 500, 200]);
});
