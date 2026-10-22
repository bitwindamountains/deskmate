import { expect, test } from 'vitest';
import { safeTimeZone, startOfLocalDay } from '@/lib/time/zone';

test('startOfLocalDay gives the instant local midnight starts, in the given zone', () => {
  // 2026-10-22 20:00 UTC is 2026-10-23 04:00 in Manila (UTC+8): that day began at 2026-10-22 16:00 UTC
  const now = new Date('2026-10-22T20:00:00Z');
  expect(startOfLocalDay(now, 'Asia/Manila').toISOString()).toBe('2026-10-22T16:00:00.000Z');
  expect(startOfLocalDay(now, 'Asia/Manila', 1).toISOString()).toBe('2026-10-23T16:00:00.000Z');
  expect(startOfLocalDay(now, 'UTC').toISOString()).toBe('2026-10-22T00:00:00.000Z');
  // New York across the end of daylight saving (2026-11-01): local midnight is 04:00 UTC before, 05:00 UTC after
  expect(startOfLocalDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
  expect(startOfLocalDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York', 1).toISOString()).toBe('2026-11-02T05:00:00.000Z');
});

test('safeTimeZone accepts real IANA zones and falls back to UTC for anything else', () => {
  expect(safeTimeZone('Asia/Manila')).toBe('Asia/Manila');
  expect(safeTimeZone('Not/AZone')).toBe('UTC');
  expect(safeTimeZone(undefined)).toBe('UTC');
  expect(safeTimeZone('x'.repeat(200))).toBe('UTC');
});
