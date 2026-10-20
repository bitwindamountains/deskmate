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
  fireEvent.change(screen.getByLabelText('Paste text'), { target: { value: 'hello world' } });
  fireEvent.click(screen.getByRole('button', { name: 'Make flashcards' }));
  expect(createSource).toHaveBeenCalledTimes(1);
});
