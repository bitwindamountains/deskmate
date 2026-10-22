import { cosine } from '@/lib/embed/duplicates';

// ponytail: picked by hand for all-MiniLM-L6-v2 (related topic ≈ 0.5+, unrelated < 0.3); re-tune from real decks if matches look off.
export const GOAL_MATCH = 0.5;
const MAX_GOALS = 200;
const BULLET = /^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/i;

/** One goal per line or ;-separated part, bullets and numbering stripped; lines under three words are too vague to match on. */
export function goalLines(text: string): string[] {
  return text.split(/[\n;]/).map((l) => l.replace(BULLET, '').trim())
    .filter((l) => l.split(/\s+/).length >= 3)
    .slice(0, MAX_GOALS);
}

/** Ids of cards whose embedding is within the threshold of any goal. */
export function matchGoals(goalVecs: number[][], cards: { id: string; vec: number[] }[], threshold = GOAL_MATCH): string[] {
  return cards.filter((c) => goalVecs.some((g) => cosine(g, c.vec) >= threshold)).map((c) => c.id);
}
