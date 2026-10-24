import { expect, test } from 'vitest';
import { recurringFor } from '@/growth/recurring';
import type { EssayItems } from '@/growth/profile';

const essay = (essayId: string, patterns: EssayItems['patterns']): EssayItems => ({ essayId, title: essayId, createdAt: '2026-10-01', words: 500, patterns });

test('recurring patterns come from other essays only, top 3 (D3.1 step 2)', () => {
  const essays = [essay('a', ['comma_splice']), essay('b', ['comma_splice', 'unsupported_claim']), essay('c', ['unsupported_claim'])];
  // Re-checking essay a: comma splices then appear in only one other essay, so they aren't recurring
  expect(recurringFor(essays, 'a')).toEqual(['Evidence']);
  expect(recurringFor(essays, 'z')).toEqual(['Evidence', 'Comma splices']); // tie on essays: the latest essay's rate breaks it
  expect(recurringFor([], 'a')).toEqual([]);
});
