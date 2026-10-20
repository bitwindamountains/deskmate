import { describe, expect, test, vi } from 'vitest';
import { cosine, findDuplicates } from '@/lib/embed/duplicates';

vi.mock('@huggingface/transformers', () => {
  throw new Error('offline');
});

const c = (id: string, embedding: number[]) => ({ id, embedding });

describe('cosine', () => {
  test('identical is 1 and orthogonal is 0', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  test('zero magnitude returns 0, not NaN', () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });
  test('mismatched lengths throw', () => {
    expect(() => cosine([1, 0], [1])).toThrow();
  });
});

describe('findDuplicates', () => {
  test('new card matching an existing one is flagged', () => {
    expect(findDuplicates([c('n1', [1, 0])], [c('e1', [1, 0])])).toEqual(['n1']);
  });
  test('two near-identical new cards: only the second is flagged', () => {
    expect(findDuplicates([c('a', [1, 0.01]), c('b', [1, 0])], [])).toEqual(['b']);
  });
  test('below threshold is not flagged', () => {
    expect(findDuplicates([c('n1', [1, 1])], [c('e1', [1, 0])])).toEqual([]);
  });
  test('threshold is inclusive', () => {
    expect(findDuplicates([c('n1', [1, 0])], [c('e1', [1, 0])], 1)).toEqual(['n1']);
  });
});

describe('getEmbedder', () => {
  test('resolves null when the model fails to load', async () => {
    const { getEmbedder } = await import('@/lib/embed/embed');
    await expect(getEmbedder()).resolves.toBeNull();
  });
});
