import { expect, test } from 'vitest';
import { resetsIn } from '@/lib/time/reset';

test.each([
  ['2026-10-24T16:00:00Z', 'in about 8 hours'],
  ['2026-10-24T23:10:00Z', 'in about 1 hour'],
  ['2026-10-24T23:40:00Z', 'in under an hour'],
  ['2026-10-24T00:00:00Z', 'in about 24 hours'],
])('at %s the daily limits reset %s', (now, text) => {
  expect(resetsIn(new Date(now))).toBe(text);
});
