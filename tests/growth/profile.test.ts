import { expect, test } from 'vitest';
import { growthProfile, type EssayItems } from '@/growth/profile';

const essay = (n: number, words: number, patterns: EssayItems['patterns']): EssayItems =>
  ({ essayId: `e${n}`, title: `Essay ${n}`, createdAt: `2026-10-0${n}T00:00:00Z`, words, patterns });

test('growthProfile counts per 1000 words, keeps patterns seen in 2+ essays, and computes the trend first→latest', () => {
  const r = growthProfile([
    essay(1, 500, ['comma_splice', 'comma_splice', 'vague_thesis', 'spelling']), // comma 4.0 per 1000
    essay(2, 1000, ['comma_splice', 'vague_thesis']),
    essay(3, 1000, ['comma_splice', 'vague_thesis', 'over_quoting']),             // comma 1.0 per 1000
  ]);
  expect(r.essays).toBe(3);
  expect(r.recurring.map((p) => p.key)).toEqual(['vague_thesis', 'comma_splice']); // tie on essays (3) → higher latest rate first? both 1.0 → stable by PATTERNS order
  const comma = r.recurring.find((p) => p.key === 'comma_splice')!;
  expect(comma).toMatchObject({ label: 'Comma splices', essays: 3, latestRate: 1 });
  expect(comma.trend).toBeCloseTo(-0.75);
  expect(r.recurring.find((p) => p.key === 'vague_thesis')!.trend).toBeCloseTo(-0.5);
});

test('a pattern absent from the first essay has no trend', () => {
  const r = growthProfile([essay(1, 1000, []), essay(2, 1000, ['run_on']), essay(3, 1000, ['run_on'])]);
  expect(r.recurring).toEqual([{ key: 'run_on', label: 'Run-on sentences', essays: 2, latestRate: 1, trend: null }]);
});

test('growthProfile with 0 or 1 essays has no recurring patterns and no trend', () => {
  expect(growthProfile([])).toEqual({ recurring: [], essays: 0 });
  expect(growthProfile([essay(1, 500, ['comma_splice', 'comma_splice'])])).toEqual({ recurring: [], essays: 1 });
});

test('trendCopy reads down, up, about the same, or nothing', async () => {
  const { trendCopy } = await import('@/growth/profile');
  expect(trendCopy(-0.6)).toBe('Down 60% since your first essay');
  expect(trendCopy(0.2)).toBe('Up 20% since your first essay');
  expect(trendCopy(0.08)).toBe('About the same as your first essay');
  expect(trendCopy(null)).toBeNull();
});
