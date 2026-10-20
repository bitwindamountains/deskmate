// Browser-only: never import from a server component. The model library is loaded lazily so it stays out of server bundles.
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

let embedder: Promise<EmbedFn | null> | undefined;

export function getEmbedder(): Promise<EmbedFn | null> {
  embedder ??= (async () => {
    try {
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
      return async (texts: string[]) =>
        (await extractor(texts, { pooling: 'mean', normalize: true })).tolist() as number[][];
    } catch {
      return null; // offline / low memory: callers skip dedupe
    }
  })();
  return embedder;
}
