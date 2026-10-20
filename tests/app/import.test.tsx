import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const createSource = vi.fn();
vi.mock('@/app/(app)/study/import/actions', () => ({ createSource: (...a: unknown[]) => createSource(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ImportForm } from '@/app/(app)/study/import/import-form';

afterEach(() => { cleanup(); createSource.mockReset(); });

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
