import { expect, test } from 'vitest';
import { applyJudgement, planCarryOver, type PrevItem } from '@/lib/essay/carry';

const item = (id: string, over: Partial<PrevItem> = {}): PrevItem => ({
  id,
  layer: 'paragraph',
  paragraph_index: 0,
  quote: 'q',
  summary: 's',
  status: 'open',
  ...over,
});

test('unchanged paragraph moved from index 2 to 3 keeps its items with paragraph_index 3', () => {
  const plan = planCarryOver(['a', 'b', 'c'], ['a', 'b', 'x', 'c'], [item('i1', { paragraph_index: 2, layer: 'sentence' })]);
  expect(plan.keep).toEqual([{ id: 'i1', paragraph_index: 3 }]);
  expect(plan.judge).toEqual([]);
  expect(plan.changed).toEqual([2]);
});

test('edited paragraph sends its items to judge and lists its index in changed', () => {
  const edited = item('i1', { paragraph_index: 1 });
  const global = item('g', { layer: 'global', paragraph_index: null, quote: null });
  const plan = planCarryOver(['a', 'b'], ['a', 'b2'], [edited, global]);
  expect(plan.keep).toEqual([]);
  expect(plan.judge).toEqual([edited, global]);
  expect(plan.changed).toEqual([1]);
});

test('addressed items are not carried', () => {
  const plan = planCarryOver(['a'], ['b'], [
    item('i1', { status: 'addressed' }),
    item('g', { layer: 'global', paragraph_index: null, status: 'addressed' }),
  ]);
  expect(plan.keep).toEqual([]);
  expect(plan.judge).toEqual([]);
});

test('an item the model omits from carried comes back open', () => {
  const plan = planCarryOver(['a', 'b'], ['x', 'y'], [item('i1'), item('i2', { paragraph_index: 1 })]);
  expect(
    applyJudgement(plan, [
      { id: 'i1', status: 'addressed' },
      { id: 'made-up', status: 'partial' },
    ]),
  ).toEqual([
    { id: 'i1', status: 'addressed' },
    { id: 'i2', status: 'open' },
  ]);
});

test('withdrawn items are not carried to the next draft', () => {
  const plan = planCarryOver(['a'], ['a2'], [item('w', { status: 'withdrawn' }), item('w2', { status: 'withdrawn', layer: 'global', paragraph_index: null })]);
  expect(plan.keep).toEqual([]);
  expect(plan.judge).toEqual([]);
});
