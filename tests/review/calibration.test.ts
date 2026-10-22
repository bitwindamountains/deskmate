import { expect, test } from 'vitest';
import { calibration, EXPECTED, type Confidence } from '@/review/calibration';

const rows = (n: number, confidence: Confidence, final_rating: number) => Array.from({ length: n }, () => ({ confidence, final_rating }));

test('calibration: all Confident and correct scores 90; all Guessing and wrong scores 67; under 10 rows is null', () => {
  expect(calibration(rows(10, 3, 3))).toEqual({ score: 90, n: 10 });
  expect(calibration(rows(12, 1, 1))).toEqual({ score: 67, n: 12 });
  expect(calibration(rows(9, 3, 3))).toBeNull();
});

test('Good and Easy count as correct; Hard and Again do not', () => {
  expect(calibration([...rows(5, 2, 4), ...rows(5, 2, 2)])).toEqual({ score: 50, n: 10 }); // |0.6-1| and |0.6-0| average 0.5
});

test('the expected accuracy per level matches the plan', () => {
  expect(EXPECTED).toEqual({ 1: 0.33, 2: 0.6, 3: 0.9 });
});
