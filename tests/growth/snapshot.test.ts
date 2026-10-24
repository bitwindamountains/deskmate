import { expect, test } from 'vitest';
import { headStartCategories } from '@/growth/learner';
import { growthSnapshot } from '@/growth/profile';

const score = (criterion: string, s: number) => ({ criterion, score: s });

test('growth snapshot: strongest criterion by average score, and the most recurring pattern (A-S1)', () => {
  const scores = [[score('Thesis', 2), score('Organization', 4)], [score('Thesis', 3), score('Organization', 3)], [score('Evidence', 4)]];
  const recurring = [{ label: 'Evidence: claims without support' }, { label: 'Comma splices' }];
  expect(growthSnapshot(scores, recurring)).toEqual({ strength: 'Organization', workingOn: 'Evidence: claims without support' });
});

test('growth snapshot needs two scores for a strength, and is empty with no data', () => {
  expect(growthSnapshot([[score('Evidence', 4)]], [])).toEqual({ strength: null, workingOn: null });
  expect(growthSnapshot([], [])).toEqual({ strength: null, workingOn: null });
});

const opened = (category: string, essay: string, level: number) => ({ category, essay_id: essay, highest_level: level });

test('hint head start: a category needing hint 4+ on average across 3 essays starts at hint 2 (spec J7)', () => {
  const items = [
    opened('evidence', 'e1', 5), opened('evidence', 'e2', 4), opened('evidence', 'e3', 4),
    opened('thesis', 'e1', 5), opened('thesis', 'e2', 5), // only 2 essays
    opened('transitions', 'e1', 2), opened('transitions', 'e2', 3), opened('transitions', 'e3', 4), // average 3
  ];
  expect(headStartCategories(items)).toEqual(['evidence']);
});

test('items resolved without opening a hint bring the average down, so the head start switches off', () => {
  const items = [opened('evidence', 'e1', 5), opened('evidence', 'e2', 4), opened('evidence', 'e3', 4), opened('evidence', 'e4', 0), opened('evidence', 'e4', 0)];
  expect(headStartCategories(items)).toEqual([]);
});
