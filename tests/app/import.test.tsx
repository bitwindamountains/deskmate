import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const createSource = vi.fn();
vi.mock('@/app/(app)/study/import/actions', () => ({ createSource: (...a: unknown[]) => createSource(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const extractEssayFile = vi.fn();
vi.mock('@/lib/essay/extract', () => ({ extractEssayFile: (f: File) => extractEssayFile(f) }));

import { ImportForm } from '@/app/(app)/study/import/import-form';

afterEach(() => { cleanup(); createSource.mockReset(); extractEssayFile.mockReset(); });

test('import form shows the word-limit error without calling createSource', () => {
  render(<ImportForm decks={[]} />);
  fireEvent.change(screen.getByLabelText('New deck name'), { target: { value: 'Bio' } });
  fireEvent.change(screen.getByLabelText('Paste text'), { target: { value: 'w '.repeat(100_000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  expect(screen.getByRole('alert').textContent).toContain("That's about 100,000 words.");
  expect(createSource).not.toHaveBeenCalled();
});

test('valid paste calls createSource', () => {
  createSource.mockResolvedValue({ ok: false, error: 'x' });
  render(<ImportForm decks={[]} />);
  fireEvent.change(screen.getByLabelText('New deck name'), { target: { value: 'Bio' } });
  fireEvent.change(screen.getByLabelText('Paste text'), { target: { value: 'w '.repeat(30) } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  expect(createSource).toHaveBeenCalledTimes(1);
});

test('a rejected createSource shows the save error', async () => {
  createSource.mockRejectedValue(new Error('network'));
  render(<ImportForm decks={[]} />);
  fireEvent.change(screen.getByLabelText('New deck name'), { target: { value: 'Bio' } });
  fireEvent.change(screen.getByLabelText('Paste text'), { target: { value: 'w '.repeat(30) } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  expect((await screen.findByRole('alert')).textContent).toContain("We couldn't save your material. Please try again.");
});

test('deck-name error is tied to the deck-name input', () => {
  render(<ImportForm decks={[]} />);
  fireEvent.change(screen.getByLabelText('Paste text'), { target: { value: 'w '.repeat(30) } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  const input = screen.getByLabelText('New deck name');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe('import-err');
});

const file = (name: string) => new File(['x'], name);

test('a Word file fills the text box and imports as text named after the file', async () => {
  extractEssayFile.mockResolvedValue({ ok: true, text: 'Mitochondria make ATP. '.repeat(10).trim() });
  createSource.mockResolvedValue({ ok: false, error: 'x' });
  render(<ImportForm decks={[]} />);
  fireEvent.change(screen.getByLabelText('PDF or Word file'), { target: { files: [file('Cell notes.docx')] } });
  await waitFor(() => expect((screen.getByLabelText('Paste text') as HTMLTextAreaElement).value).toContain('Mitochondria make ATP.'));
  fireEvent.change(screen.getByLabelText('New deck name'), { target: { value: 'Bio' } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  expect(createSource.mock.calls[0][0]).toMatchObject({ kind: 'text', title: 'Cell notes' });
});

test('an unreadable Word file or another file type says so', async () => {
  extractEssayFile.mockResolvedValue({ ok: false, error: "We couldn't read that file. Try another file or paste the text instead." });
  render(<ImportForm decks={[]} />);
  const input = screen.getByLabelText('PDF or Word file');
  fireEvent.change(input, { target: { files: [file('notes.docx')] } });
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't read that file. Try another file or paste the text instead.");
  fireEvent.change(input, { target: { files: [file('notes.pages')] } });
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a PDF or Word (.docx) file.');
});
