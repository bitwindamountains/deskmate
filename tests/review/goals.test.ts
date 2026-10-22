import { expect, test } from 'vitest';
import { goalLines, matchGoals } from '@/review/goals';

test('goalLines keeps objective-sized lines without bullets', () => {
  expect(goalLines('1. Explain how cells make energy\n- osmosis\n• Compare mitosis and meiosis; describe the cell cycle\n\na) Name the parts of a cell'))
    .toEqual(['Explain how cells make energy', 'Compare mitosis and meiosis', 'describe the cell cycle', 'Name the parts of a cell']);
  expect(goalLines('')).toEqual([]);
  expect(goalLines(Array.from({ length: 300 }, (_, i) => `goal number ${i}`).join('\n'))).toHaveLength(200);
});

test('matchGoals returns cards near any goal', () => {
  expect(matchGoals([[1, 0]], [{ id: 'a', vec: [0.9, 0.1] }, { id: 'b', vec: [0, 1] }])).toEqual(['a']);
  expect(matchGoals([[1, 0], [0, 1]], [{ id: 'a', vec: [0.9, 0.1] }, { id: 'b', vec: [0, 1] }])).toEqual(['a', 'b']);
  expect(matchGoals([], [{ id: 'a', vec: [1, 0] }])).toEqual([]);
});
