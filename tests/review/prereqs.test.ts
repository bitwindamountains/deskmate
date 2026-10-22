import { expect, test } from 'vitest';
import type { ReviewCard } from '@/lib/review/load';
import type { ConceptMastery } from '@/review/mastery';
import { remediation, wouldCycle, type Edge } from '@/review/prereqs';
import type { StateRow } from '@/review/schedule';

const e = (concept: string, prereq: string, deckId = 'd'): Edge => ({ deckId, concept, prereq });

test('wouldCycle finds direct and longer loops in the same deck only', () => {
  expect(wouldCycle([e('b', 'a')], 'd', 'a', 'b')).toBe(true);
  expect(wouldCycle([e('c', 'b'), e('b', 'a')], 'd', 'a', 'c')).toBe(true);
  expect(wouldCycle([e('b', 'a', 'other')], 'd', 'a', 'b')).toBe(false);
  expect(wouldCycle([e('b', 'a')], 'd', 'c', 'b')).toBe(false);
});

const m = (key: string, strength: ConceptMastery['strength']): ConceptMastery =>
  ({ key, label: key[0].toUpperCase() + key.slice(1), deckId: 'd', cards: 1, strength, retrievability: null });
const card = (concept: string, lapses: number): ReviewCard => ({ id: concept, deckId: 'd', type: 'basic', importance: 2, front: 'q', back: 'a',
  keyPoints: [], concept, state: { lapses } as StateRow });

test('remediation lists the weak prerequisites of a concept with a leech card', () => {
  const mastery = [m('cell respiration', 'weak'), m('glycolysis', 'shaky'), m('atp', 'strong'), m('osmosis', 'weak')];
  const cards = [card('Cell respiration ', 4), card('osmosis', 1)];
  const edges = [e('cell respiration', 'glycolysis'), e('cell respiration', 'atp'), e('osmosis', 'glycolysis'), e('cell respiration', 'gone')];
  expect(remediation(mastery, cards, edges)).toEqual([
    { deckId: 'd', concept: 'Cell respiration', prereqs: [{ key: 'glycolysis', label: 'Glycolysis', strength: 'shaky' }] },
  ]);
  expect(remediation(mastery, cards, [e('cell respiration', 'atp')])).toEqual([]);
  expect(remediation(mastery, [card('osmosis', 1)], edges)).toEqual([]);
});
