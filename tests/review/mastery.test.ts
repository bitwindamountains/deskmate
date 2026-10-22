import { expect, test } from 'vitest';
import type { ReviewCard } from '@/lib/review/load';
import { conceptMastery, forgettingCurve } from '@/review/mastery';
import type { StateRow } from '@/review/schedule';

const now = new Date('2026-11-02T09:00:00');
const day = (n: number) => new Date(now.getTime() + n * 86400000);

// A review card last seen `ago` days ago with the given stability; retrievability falls as ago grows past it.
const seen = (id: string, stability: number, ago: number, dueIn = stability - ago): StateRow => ({
  card_id: id, due: day(dueIn).toISOString(), stability, difficulty: 5, scheduled_days: stability, learning_steps: 0,
  reps: 4, lapses: 0, state: 2, last_review: day(-ago).toISOString(),
});
const card = (id: string, concept: string, state: StateRow | null, deckId = 'd1'): ReviewCard =>
  ({ id, deckId, type: 'basic', importance: 2, state, front: 'F', back: 'B', keyPoints: [], concept });

test('conceptMastery groups "Glycolysis" and " glycolysis " and labels strength by thresholds 0.9/0.7', () => {
  const m = conceptMastery([
    card('a', 'Glycolysis', seen('a', 30, 1)),
    card('b', ' glycolysis ', seen('b', 30, 2)),
    card('c', 'Glycolysis', seen('c', 30, 1)),
    card('d', 'Krebs cycle', seen('d', 2, 20)),
    card('e', 'Osmosis', seen('e', 10, 25)),
  ], now);
  const glyco = m.find((c) => c.key === 'glycolysis')!;
  expect(glyco).toMatchObject({ label: 'Glycolysis', deckId: 'd1', cards: 3, strength: 'strong' });
  expect(m).toHaveLength(3);
  expect(m.find((c) => c.key === 'osmosis')!.strength).toBe('shaky');
  expect(m.find((c) => c.key === 'krebs cycle')!.strength).toBe('weak');
  expect(m.map((c) => c.key)).toEqual(['krebs cycle', 'osmosis', 'glycolysis']);
});

test('concepts with no reviewed card are not started and sort last', () => {
  const m = conceptMastery([
    card('a', 'Mitosis', null),
    card('b', 'Meiosis', seen('b', 2, 20)),
    card('c', 'Cells', seen('c', 30, 1), 'd2'),
  ], now);
  expect(m.map((c) => [c.deckId, c.key, c.strength])).toEqual([
    ['d1', 'meiosis', 'weak'], ['d1', 'mitosis', 'not started'], ['d2', 'cells', 'strong'],
  ]);
  expect(m[1].retrievability).toBeNull();
});

test('forgettingCurve decays without review and the reviewed-today line stays above it', () => {
  // one card due today, one not due for a while, one never reviewed (ignored)
  const curve = forgettingCurve([card('a', 'A', seen('a', 5, 5, 0)), card('b', 'B', seen('b', 20, 2)), card('c', 'C', null)], now);
  expect(curve).toHaveLength(31);
  expect(curve[0].day).toBe(0);
  for (let i = 1; i < curve.length; i++) {
    expect(curve[i].ifIdle).toBeLessThan(curve[i - 1].ifIdle);
    expect(curve[i].ifReviewedToday).toBeGreaterThan(curve[i].ifIdle);
  }
  expect(forgettingCurve([card('c', 'C', null)], now)).toEqual([]);
});

test('"due today" in the curve follows the student time zone, not the server day', async () => {
  const { forgettingCurve } = await import('@/review/mastery');
  // 10:00 UTC is 18:00 in Manila; a card due at 20:00 UTC is due "today" by the UTC day but tomorrow in Manila.
  const now = new Date('2026-10-22T10:00:00Z');
  const state = { due: '2026-10-22T20:00:00.000Z', stability: 3, difficulty: 5, scheduled_days: 3, learning_steps: 0, reps: 3, lapses: 0, state: 2,
    last_review: '2026-10-19T20:00:00.000Z' };
  const cards = [{ id: 'c', deckId: 'd', type: 'basic', importance: 2, front: 'F', back: 'B', keyPoints: [], concept: 'x', state }] as never;
  const utc = forgettingCurve(cards, now, 5, 'UTC');
  const manila = forgettingCurve(cards, now, 5, 'Asia/Manila');
  expect(utc[3].ifReviewedToday).not.toBe(utc[3].ifIdle);       // reviewed today under UTC
  expect(manila.map((p) => p.ifReviewedToday)).toEqual(manila.map((p) => p.ifIdle)); // not due today in Manila
});
