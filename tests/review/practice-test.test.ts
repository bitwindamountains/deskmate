import { expect, test } from 'vitest';
import { buildTest } from '@/review/practice-test';

const card = (n: number, over: Partial<{ type: string; back: string }> = {}) =>
  ({ id: `c${n}`, front: `Question ${n}?`, back: over.back ?? `Answer ${n}`, type: over.type ?? 'basic', keyPoints: [] });

test('buildTest makes choice questions with 3 distinct distractors, falls back to short answer, caps at 20, is seed-stable', () => {
  const cards = Array.from({ length: 25 }, (_, i) => card(i));
  const t = buildTest(cards, 7);
  expect(t).toHaveLength(20);
  expect(buildTest(cards, 7)).toEqual(t);
  expect(buildTest(cards, 8)).not.toEqual(t);
  for (const q of t) {
    expect(q.kind).toBe('choice');
    expect(q.choices).toHaveLength(4);
    expect(new Set(q.choices).size).toBe(4);
    expect(q.choices).toContain(q.answer);
  }
  // why cards are always short answer; too few distinct backs means short answer
  const few = buildTest([card(1, { type: 'why' }), card(2), card(3, { back: 'Answer 2' })], 1);
  expect(few.map((q) => q.kind).sort()).toEqual(['short', 'short', 'short']);
});

test('buildTest needs at least 2 cards', () => {
  expect(buildTest([card(1)], 1)).toEqual([]);
});
