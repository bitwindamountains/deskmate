import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const practicePattern = vi.fn();
vi.mock('@/app/(app)/progress/actions', () => ({ practicePattern: (...a: unknown[]) => practicePattern(...a) }));
import { ProgressView } from '@/app/(app)/progress/progress-view';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const base = {
  growth: { essays: 3, recurring: [
    { key: 'comma_splice' as const, label: 'Comma splices', essays: 3, latestRate: 1, trend: -0.6 },
    { key: 'spelling' as const, label: 'Spelling', essays: 2, latestRate: 2, trend: 0.05 },
  ] },
  calibration: { recall: 80, writing: 50, combined: 76 }, counts: { answers: 30, criteria: 4 },
  hint: 3.3, leech: 12,
};

test('Progress shows patterns with trend copy and Practice this, the calibration lines, and empty states', async () => {
  practicePattern.mockResolvedValue({ ok: true, deckId: 'd1', added: 4 });
  render(<ProgressView {...base} />);
  const patterns = screen.getByRole('region', { name: 'Writing patterns' });
  const items = within(patterns).getAllByRole('listitem');
  expect(items[0].textContent).toContain('Down 60% since your first essay');
  expect(items[1].textContent).toContain('About the same as your first essay');
  expect(within(items[1]).queryByRole('button', { name: /Practice this/ })).toBeNull(); // no templates for spelling
  fireEvent.click(within(items[0]).getByRole('button', { name: 'Practice this: Comma splices' }));
  expect(await within(items[0]).findByText('Added 4 practice cards to Writing practice.')).toBeTruthy();
  expect(practicePattern).toHaveBeenCalledWith('comma_splice');

  const cal = screen.getByRole('region', { name: 'Self-check accuracy' });
  expect(cal.textContent).toContain('Flashcards: 80% (from 30 answers)');
  expect(cal.textContent).toContain('Essays: 50% (from 4 criteria)');
  expect(cal.textContent).toContain('Both tools: 76%');
  const habits = screen.getByRole('region', { name: 'Habits' });
  expect(habits.textContent).toContain('Deepest hint you usually open: 3.3 of 5');
  expect(habits.textContent).toContain('Cards that keep slipping: 12%');
  expect(screen.getByRole('link', { name: 'See your mastery map' }).getAttribute('href')).toBe('/study/mastery');
});

test('Progress empty states: no essays, no recurring patterns, one-tool calibration', () => {
  render(<ProgressView {...base} growth={{ essays: 0, recurring: [] }} calibration={{ recall: 80, writing: null, combined: null }} hint={null} leech={null} />);
  expect(screen.getByText('Check an essay to see your writing patterns.')).toBeTruthy();
  const cal = screen.getByRole('region', { name: 'Self-check accuracy' });
  expect(cal.textContent).toContain('Flashcards: 80%');
  expect(cal.textContent).not.toContain('Both tools');
  expect(cal.textContent).toContain('Essays: rate an essay yourself before feedback to see this.');
  cleanup();
  render(<ProgressView {...base} growth={{ essays: 1, recurring: [] }} />);
  expect(screen.getByText('No pattern has come up in two essays yet.')).toBeTruthy();
});

test('Practice this shows the already-added note and is disabled while sending', async () => {
  let resolve!: (v: unknown) => void;
  practicePattern.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<ProgressView {...base} />);
  const btn = screen.getByRole('button', { name: 'Practice this: Comma splices' });
  fireEvent.click(btn);
  expect((btn as HTMLButtonElement).disabled).toBe(true);
  resolve({ ok: true, deckId: 'd1', added: 0 });
  expect(await screen.findByText('Already in your Writing practice deck.')).toBeTruthy();
});
