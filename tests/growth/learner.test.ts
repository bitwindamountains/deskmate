import { expect, test } from 'vitest';
import { hintReliance, leechRate, sharedCalibration, writingCalibration } from '@/growth/learner';

test('sharedCalibration weights by counts and leaves combined null when one part is missing', () => {
  // recall 80% over 30 answers, writing 2 of 4 criteria (50%) → (80*30 + 50*4) / 34 = 76.5 → 76
  expect(sharedCalibration({ score: 80, n: 30 }, { within: 2, of: 4 })).toEqual({ recall: 80, writing: 50, combined: 76 });
  expect(sharedCalibration({ score: 80, n: 30 }, null)).toEqual({ recall: 80, writing: null, combined: null });
  expect(sharedCalibration(null, { within: 3, of: 3 })).toEqual({ recall: null, writing: 100, combined: null });
  expect(sharedCalibration(null, { within: 1, of: 2 })).toEqual({ recall: null, writing: null, combined: null }); // fewer than 3 criteria
});

test('writingCalibration sums within-one-point across drafts', () => {
  const r = writingCalibration([
    { self: [{ criterion: 'Thesis', score: 4 }, { criterion: 'Evidence', score: 1 }], ai: [{ criterion: 'Thesis', score: 3 }, { criterion: 'Evidence', score: 4 }] },
    { self: [{ criterion: 'Thesis', score: 2 }], ai: [{ criterion: 'Thesis', score: 2 }] },
  ]);
  expect(r).toEqual({ within: 2, of: 3 });
  expect(writingCalibration([])).toBeNull();
});

test('hintReliance and leechRate handle empty input as null', () => {
  expect(hintReliance([0, 0, 2, 3, 5])).toBe(3.3);
  expect(hintReliance([0, 0])).toBeNull();
  expect(leechRate([0, 1, 4, 6])).toBe(50);
  expect(leechRate([])).toBeNull();
});
