// Browser-only: never import from a server component. The model library is loaded lazily so it stays out of server bundles.
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

const RETRY_MS = 60_000;
let embedder: Promise<EmbedFn | null> | undefined;
let lastFailureAt = -Infinity;

export function getEmbedder(): Promise<EmbedFn | null> {
  if (!embedder && Date.now() - lastFailureAt < RETRY_MS) return Promise.resolve(null);
  embedder ??= (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
      return async (texts: string[]) =>
        (await extractor(texts, { pooling: 'mean', normalize: true })).tolist() as number[][];
    } catch {
      // offline / low memory: callers skip dedupe; allow a retry after RETRY_MS
      lastFailureAt = Date.now();
      embedder = undefined;
      return null;
    }
  })();
  return embedder;
}
