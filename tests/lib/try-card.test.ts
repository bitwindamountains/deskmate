import { expect, test } from 'vitest';
import { formatGap, isRight, spacingIfRight, TRY_CARDS } from '@/lib/try-card';

const MIN = 60_000, DAY = 86_400_000;

test('right answers ignore case, articles, punctuation and small typos', () => {
  expect(isRight('The Mitochondria.', ['mitochondria'])).toBe(true);
  expect(isRight('mitocondria', ['mitochondria'])).toBe(true);
  expect(isRight('ribosome', ['mitochondria'])).toBe(false);
  expect(isRight('  ', ['mitochondria'])).toBe(false);
});

test('every sample card accepts its own answers', () => {
  expect(TRY_CARDS).toHaveLength(3);
  for (const c of TRY_CARDS) for (const a of c.answers) expect(isRight(a, c.answers)).toBe(true);
});

test('the spacing comes from the scheduler: 10 minutes first, then longer each time', () => {
  const gaps = spacingIfRight(new Date('2026-11-27T12:00:00Z'));
  expect(gaps[0]).toBe(10 * MIN);
  for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  expect(gaps.at(-1)!).toBeGreaterThan(DAY);
});

test('gaps read as plain words', () => {
  expect(formatGap(10 * MIN)).toBe('10 minutes');
  expect(formatGap(1 * DAY)).toBe('a day');
  expect(formatGap(2.4 * DAY)).toBe('about 2 days');
  expect(formatGap(7.3 * DAY)).toBe('about a week');
  expect(formatGap(20 * DAY)).toBe('about 3 weeks');
  expect(formatGap(65 * DAY)).toBe('about 2 months');
});
