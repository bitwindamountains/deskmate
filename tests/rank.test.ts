import { expect, test } from 'vitest';
import { priorityCount, rankFeedback } from '../src/rank.js';

type It = { layer: 'global' | 'paragraph' | 'sentence'; severity: 'low' | 'medium' | 'high'; category: string; rubric_criterion: string; id?: string };

test('global high outranks paragraph high', () => {
  const r = rankFeedback<It>([
    { layer: 'paragraph', severity: 'high', category: 'evidence', rubric_criterion: 'Evidence', id: 'p' },
    { layer: 'global', severity: 'high', category: 'thesis', rubric_criterion: 'Thesis', id: 'g' },
  ]);
  expect(r.map((x) => x.id)).toEqual(['g', 'p']);
});

test('score formula: paragraph, medium, weight 2, 1 repeat = 2*2*2*1.25 = 10', () => {
  const r = rankFeedback<It>(
    [
      { layer: 'paragraph', severity: 'medium', category: 'evidence', rubric_criterion: 'Evidence', id: 'x' },
      { layer: 'sentence', severity: 'low', category: 'evidence', rubric_criterion: 'Other', id: 'y' },
    ],
    { Evidence: 2 },
  );
  expect(r.find((i) => i.id === 'x')!.priority_score).toBe(10);
  // missing criterion weight defaults to 1: sentence 1 * 1 * low 1 * 1.25
  expect(r.find((i) => i.id === 'y')!.priority_score).toBe(1.25);
});

test('ranks are 1..n and ties keep input order', () => {
  const same = { layer: 'paragraph', severity: 'low', rubric_criterion: 'E' } as const;
  const r = rankFeedback<It>([
    { ...same, category: 'a', id: '1' },
    { ...same, category: 'b', id: '2' },
    { ...same, category: 'c', id: '3' },
  ]);
  expect(r.map((x) => [x.id, x.priority_rank])).toEqual([
    ['1', 1],
    ['2', 2],
    ['3', 3],
  ]);
});

test.each([
  [[{ action: 'got_it' }, { action: 'got_it' }, { action: 'got_it' }], 5],
  [[{ action: 'got_it' }, { action: 'disagree' }, { action: 'got_it' }], 3],
  [[{ action: 'got_it' }, { action: 'got_it' }], 3],
  [null, 3],
])('priorityCount %j -> %i (spec J5)', (recent, n) => {
  expect(priorityCount(recent)).toBe(n);
});
