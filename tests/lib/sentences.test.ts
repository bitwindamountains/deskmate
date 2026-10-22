import { expect, test } from 'vitest';
import { splitSentences } from '@/lib/essay/sentences';

test('splitSentences splits on sentence ends and keeps offsets into the paragraph', () => {
  const p = 'Phones distract students. Do they help? Some say yes!  Dr. Cruz disagrees.';
  const s = splitSentences(p);
  expect(s.slice(0, 3).map((x) => p.slice(x.start, x.end))).toEqual(['Phones distract students.', 'Do they help?', 'Some say yes!']);
  for (const x of s) expect(p.slice(x.start, x.end)).toBe(p.slice(x.start, x.end).trim());
  expect(splitSentences('')).toEqual([]);
  expect(splitSentences('No end mark')).toEqual([{ start: 0, end: 11 }]);
});
