import { LEECH_LAPSES } from '@/growth/learner';
import type { ReviewCard } from '@/lib/review/load';
import type { ConceptMastery, Strength } from './mastery';

/** concept builds on prereq; both are concept keys (trimmed, lower-case), as concept_prereqs stores them. */
export type Edge = { deckId: string; concept: string; prereq: string };
export type Remedy = { deckId: string; concept: string; prereqs: { key: string; label: string; strength: Strength }[] };

export const conceptKey = (c: string) => c.trim().toLowerCase();

/** True when prereq already builds on concept (directly or through others), so the new edge would close a loop. */
export function wouldCycle(edges: Edge[], deckId: string, concept: string, prereq: string): boolean {
  const seen = new Set<string>();
  const stack = [prereq];
  while (stack.length) {
    const at = stack.pop()!;
    if (at === concept) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const e of edges) if (e.deckId === deckId && e.concept === at) stack.push(e.prereq);
  }
  return false;
}

/** B4.1: for each concept with a leech card, its direct prerequisites that aren't strong yet. Edges to concepts with no cards are ignored. */
export function remediation(mastery: ConceptMastery[], cards: ReviewCard[], edges: Edge[]): Remedy[] {
  const id = (deckId: string, key: string) => `${deckId}\n${key}`;
  const byId = new Map(mastery.map((m) => [id(m.deckId, m.key), m]));
  const struggling = new Set(cards.filter((c) => (c.state?.lapses ?? 0) >= LEECH_LAPSES).map((c) => id(c.deckId, conceptKey(c.concept))));
  return mastery.filter((m) => struggling.has(id(m.deckId, m.key))).map((m): Remedy => ({
    deckId: m.deckId,
    concept: m.label,
    prereqs: edges.filter((e) => e.deckId === m.deckId && e.concept === m.key)
      .map((e) => byId.get(id(e.deckId, e.prereq)))
      .filter((p): p is ConceptMastery => !!p && p.strength !== 'strong')
      .map((p) => ({ key: p.key, label: p.label, strength: p.strength })),
  })).filter((r) => r.prereqs.length);
}
