import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { TestRunner } from '@/app/(app)/study/deck/[deckId]/test/test-runner';
import type { TestQuestion } from '@/review/practice-test';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const Q: TestQuestion[] = [
  { cardId: 'a', kind: 'choice', prompt: 'Where is ATP made?', answer: 'Mitochondria', choices: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], keyPoints: [], type: 'basic' },
  { cardId: 'b', kind: 'short', prompt: 'What does DNA stand for?', answer: 'Deoxyribonucleic acid', keyPoints: [] , type: 'basic' },
  { cardId: 'c', kind: 'short', prompt: 'Why do cells divide?', answer: 'To grow and repair tissue', keyPoints: ['grow', 'repair'], type: 'why' },
];

test('a deck with one card says Add at least 2 cards to make a test', () => {
  render(<TestRunner deckId="d" deckTitle="Bio" questions={[]} />);
  expect(screen.getByText('Add at least 2 cards to make a test.')).toBeTruthy();
});

test('the runner scores choices and typed answers and lists the missed cards', async () => {
  render(<TestRunner deckId="d" deckTitle="Bio" questions={Q.slice(0, 2)} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Nucleus' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'deoxyribonucleic acid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const result = await screen.findByRole('region', { name: 'Your result' });
  expect(within(result).getByText('1 of 2 right')).toBeTruthy();
  expect(within(result).getByText('Where is ATP made?')).toBeTruthy();
  expect(within(result).getByText('Answer: Mitochondria')).toBeTruthy();
  expect(within(result).queryByText('What does DNA stand for?')).toBeNull();
});

test('a typed answer the cascade cannot settle asks the student to mark it', async () => {
  render(<TestRunner deckId="d" deckTitle="Bio" questions={[Q[2], Q[0]]} />);
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'so the body can get bigger and heal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Check this one yourself')).toBeTruthy();
  expect(screen.getByText('To grow and repair tissue')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'I got it right' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Mitochondria' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('2 of 2 right')).toBeTruthy();
});
