import { Rating } from 'ts-fsrs';

const key = (concept: string) => concept.trim().toLowerCase();

/**
 * "Mix topics" (B3.9): take one card from each concept in turn, so similar ideas are told apart rather than run together.
 * Each concept keeps its own order (the session's due order), and concepts take turns in order of first appearance.
 */
export function interleave<T extends { concept: string }>(queue: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of queue) {
    const g = groups.get(key(c.concept));
    if (g) g.push(c);
    else groups.set(key(c.concept), [c]);
  }
  const out: T[] = [];
  for (let round = 0; out.length < queue.length; round++) {
    for (const g of groups.values()) if (round < g.length) out.push(g[round]);
  }
  return out;
}

const MAX_LISTED = 3;

/** Session summary (B-S6): concepts rated Good or Easy every time, and concepts with any Again. First spelling seen is shown. */
export function conceptSummary(done: { concept: string; rating: number }[]): { improved: string[]; needsAttention: string[] } {
  const seen = new Map<string, { label: string; ratings: number[] }>();
  for (const d of done) {
    const s = seen.get(key(d.concept));
    if (s) s.ratings.push(d.rating);
    else seen.set(key(d.concept), { label: d.concept.trim(), ratings: [d.rating] });
  }
  const all = [...seen.values()];
  return {
    improved: all.filter((s) => s.ratings.every((r) => r >= Rating.Good)).map((s) => s.label).slice(0, MAX_LISTED),
    needsAttention: all.filter((s) => s.ratings.includes(Rating.Again)).map((s) => s.label).slice(0, MAX_LISTED),
  };
}
