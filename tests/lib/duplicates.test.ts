import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cosine, findDuplicates } from '@/lib/embed/duplicates';

const pipeline = vi.hoisted(() => vi.fn());
vi.mock('@huggingface/transformers', () => ({ pipeline }));

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
  const load = async () => {
    vi.resetModules();
    return (await import('@/lib/embed/embed')).getEmbedder;
  };
  beforeEach(() => {
    pipeline.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  test('resolves null when the model fails to load', async () => {
    pipeline.mockRejectedValue(new Error('offline'));
    const getEmbedder = await load();
    await expect(getEmbedder()).resolves.toBeNull();
  });
  test('within 60s of a failure returns null without retrying', async () => {
    pipeline.mockRejectedValue(new Error('offline'));
    const getEmbedder = await load();
    await getEmbedder();
    vi.setSystemTime(1_000_000 + 59_000);
    await expect(getEmbedder()).resolves.toBeNull();
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
  test('after 60s retries the import', async () => {
    pipeline.mockRejectedValue(new Error('offline'));
    const getEmbedder = await load();
    await getEmbedder();
    vi.setSystemTime(1_000_000 + 61_000);
    await getEmbedder();
    expect(pipeline).toHaveBeenCalledTimes(2);
  });
  test('a successful load is cached', async () => {
    pipeline.mockResolvedValue(async () => ({ tolist: () => [[1]] }));
    const getEmbedder = await load();
    const f = await getEmbedder();
    expect(f).not.toBeNull();
    await expect(f!(['x'])).resolves.toEqual([[1]]);
    await getEmbedder();
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});
