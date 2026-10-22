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

test('a DST gap at midnight starts the day at the first real local time, not an hour early', () => {
  // Santiago skips 00:00-00:59 on 2026-09-06 (clocks go to 01:00, UTC-3): the day starts 04:00 UTC, not 03:00 the day before
  expect(startOfLocalDay(new Date('2026-09-06T15:00:00Z'), 'America/Santiago').toISOString()).toBe('2026-09-06T04:00:00.000Z');
  // Havana skips 00:00-00:59 on 2026-03-08 (to 01:00, UTC-4)
  expect(startOfLocalDay(new Date('2026-03-08T15:00:00Z'), 'America/Havana').toISOString()).toBe('2026-03-08T05:00:00.000Z');
});

test('offsets with 30 and 45 minutes are exact', () => {
  expect(startOfLocalDay(new Date('2026-10-22T12:00:00Z'), 'Asia/Kathmandu').toISOString()).toBe('2026-10-21T18:15:00.000Z');
  expect(startOfLocalDay(new Date('2026-10-22T12:00:00Z'), 'Asia/Kolkata').toISOString()).toBe('2026-10-21T18:30:00.000Z');
});
