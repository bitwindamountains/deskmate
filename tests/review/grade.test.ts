import { describe, expect, test } from 'vitest';
import { Rating } from 'ts-fsrs';
import { gradeLocally, normalizeAnswer, scoreToRating, similarity } from '@/review/grade';

const base = { type: 'basic' as const, reference: 'The electron transport chain.', keyPoints: ['electron transport chain'], responseMs: 5000 };

describe('normalize/similarity', () => {
  test('normalizeAnswer', () => {
    expect(normalizeAnswer('  The  Ｃat, an (Apple)! ')).toBe('cat apple');
  });
  test('similarity', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', 'abd')).toBeCloseTo(2 / 3);
  });
});

describe('gradeLocally', () => {
  test('typo is fuzzy Good with no LLM', async () => {
    const r = await gradeLocally({ ...base, answer: 'the electron transport chian', responseMs: 12000 }, null);
    expect(r).toMatchObject({ source: 'fuzzy', suggested: Rating.Good, needsLlm: false });
  });
  test('exact within 10 s is Easy; after is Good', async () => {
    const a = await gradeLocally({ ...base, answer: 'Electron transport chain', responseMs: 10000 }, null);
    expect(a).toMatchObject({ source: 'exact', score: 1, suggested: Rating.Easy });
    const b = await gradeLocally({ ...base, answer: 'Electron transport chain', responseMs: 10001 }, null);
    expect(b.suggested).toBe(Rating.Good);
  });
  test('why card always needs LLM', async () => {
    const r = await gradeLocally({ ...base, type: 'why', answer: 'electron transport chain' }, null);
    expect(r.needsLlm).toBe(true);
  });
  test('embedding: one of two key points hit gives 0.5 and needs LLM', async () => {
    const embed = async (t: string[]) => t.map((x) => (x === 'my answer' ? [1, 0] : x === 'kp one' ? [1, 0] : x === 'kp two' ? [0, 1] : [1, 1]));
    const r = await gradeLocally({ type: 'basic', reference: 'long reference text with many many more than eight words in it', keyPoints: ['kp one', 'kp two'], answer: 'my answer', responseMs: 1 }, embed);
    expect(r).toMatchObject({ score: 0.5, source: 'embedding', hit: ['kp one'], missed: ['kp two'], needsLlm: true });
  });
  test('embedding without key points uses cosine to reference', async () => {
    const embed = async (t: string[]) => t.map(() => [1, 0]);
    const r = await gradeLocally({ type: 'basic', reference: 'one two three four five six seven eight nine ten', keyPoints: [], answer: 'zzz', responseMs: 1 }, embed);
    expect(r).toMatchObject({ score: 1, source: 'embedding', needsLlm: false });
  });
  test('blank answer is Again with no LLM', async () => {
    const r = await gradeLocally({ ...base, type: 'why', answer: '   ' }, null);
    expect(r).toMatchObject({ score: 0, suggested: Rating.Again, needsLlm: false });
  });
});

test.each([[0.39, Rating.Again], [0.4, Rating.Hard], [0.69, Rating.Hard], [0.7, Rating.Good], [0.89, Rating.Good]])('scoreToRating(%s)', (s, g) => {
  expect(scoreToRating(s, 1000)).toBe(g);
});
test('scoreToRating Easy needs 0.9 and <=10s', () => {
  expect(scoreToRating(0.9, 10000)).toBe(Rating.Easy);
  expect(scoreToRating(0.9, 10001)).toBe(Rating.Good);
});
