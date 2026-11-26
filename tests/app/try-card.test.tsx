import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TryCard } from '@/app/login/try-card';
import { TRY_CARDS } from '@/lib/try-card';

afterEach(cleanup);
const field = () => screen.getByLabelText('Your answer') as HTMLInputElement;
const answer = (text: string) => { fireEvent.change(field(), { target: { value: text } }); fireEvent.submit(field().form!); };

test('Check waits for an answer', () => {
  render(<TryCard />);
  expect(screen.getByText(TRY_CARDS[0].front)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field(), { target: { value: '   ' } });
  expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
});

test('a right answer says so and shows when the card would come back', () => {
  render(<TryCard />);
  answer('the Mitochondria');
  const status = screen.getByRole('status').textContent!;
  expect(status).toMatch(/Right\./);
  expect(status).toMatch(/10 minutes/);
});

test('a wrong answer shows the answer and that a miss comes back soon', () => {
  render(<TryCard />);
  answer('ribosome');
  const status = screen.getByRole('status').textContent!;
  expect(status).toMatch(/Not quite\./);
  expect(status).toMatch(new RegExp(TRY_CARDS[0].answers[0], 'i'));
  expect(status).toMatch(/comes back in a minute/);
});

test('Try another shows the next card with an empty, focused field', () => {
  render(<TryCard />);
  answer('ribosome');
  fireEvent.click(screen.getByRole('button', { name: 'Try another' }));
  expect(screen.getByText(TRY_CARDS[1].front)).toBeTruthy();
  expect(field().value).toBe('');
  expect(document.activeElement).toBe(field());
  expect(screen.getByRole('status').textContent).toBe('');
});
