// ponytail: dedupe runs on the device and is skipped when the model can't load. Cards are then kept, not lost. Move it to pgvector on the server if decks grow past a few thousand cards.
export const DUPLICATE_THRESHOLD = 0.9;

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`cosine: length mismatch ${a.length} vs ${b.length}`);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

type Item = { id: string; embedding: number[] };

export function findDuplicates(newCards: Item[], existing: Item[], threshold = DUPLICATE_THRESHOLD): string[] {
  const kept: Item[] = [...existing];
  const dups: string[] = [];
  for (const card of newCards) {
    if (kept.some((k) => cosine(card.embedding, k.embedding) >= threshold)) dups.push(card.id);
    else kept.push(card);
  }
  return dups;
}
