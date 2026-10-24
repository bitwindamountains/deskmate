import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { WeekActivity, weekActivity } from '@/app/(app)/today/week-activity';

afterEach(cleanup);

test('reviews are counted per day of the last 7 in the student zone, oldest first (B-S1)', () => {
  const now = new Date('2026-10-24T03:00:00Z'); // 11:00 on the 24th in Manila
  const days = weekActivity(['2026-10-23T17:00:00Z', '2026-10-24T01:00:00Z', '2026-10-22T10:00:00Z', '2026-10-10T10:00:00Z'], now, 'Asia/Manila');
  expect(days).toHaveLength(7);
  expect(days.at(-1)).toMatchObject({ date: '2026-10-24', count: 2 }); // 01:00 and 09:00 local on the 24th
  expect(days.at(-3)).toMatchObject({ date: '2026-10-22', count: 1 });
  expect(days[0].date).toBe('2026-10-18');
  expect(days.reduce((n, d) => n + d.count, 0)).toBe(3); // the 10th is outside the week
});

test('the chart has a total, a table for screen readers, and nothing when the week is empty', () => {
  const days = weekActivity(['2026-10-24T01:00:00Z', '2026-10-24T02:00:00Z', '2026-10-21T02:00:00Z'], new Date('2026-10-24T03:00:00Z'), 'UTC');
  const { rerender, container } = render(<WeekActivity days={days} />);
  expect(screen.getByRole('heading', { name: 'Reviews this week' })).toBeTruthy();
  expect(screen.getByText('3 reviews in the last 7 days')).toBeTruthy();
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(8); // header + 7 days
  expect(within(table).getByText('Sat 24 Oct')).toBeTruthy();
  rerender(<WeekActivity days={weekActivity([], new Date('2026-10-24T03:00:00Z'), 'UTC')} />);
  expect(container.textContent).toBe('');
});
