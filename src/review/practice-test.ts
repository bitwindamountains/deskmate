import { CARD_TYPES, EXPLAIN_TYPES, type CardType } from '@/lib/cards/types';
import { random, sameAnswer as same, shuffle } from './formats';
export type TestQuestion = { cardId: string; kind: 'choice' | 'short'; prompt: string; answer: string; choices?: string[];
  keyPoints: string[]; type: CardType };
type TestCard = { id: string; front: string; back: string; type: string; keyPoints: string[] };

const MAX_QUESTIONS = 20;
/** B4.4: a mock test from a deck. Multiple choice draws distractors from other cards' answers; why cards stay short answer. */
export function buildTest(cards: TestCard[], seed: number): TestQuestion[] {
  if (cards.length < 2) return [];
  const rnd = random(seed);
  return shuffle(cards, rnd).slice(0, MAX_QUESTIONS).map((c) => {
    const type = ((CARD_TYPES as readonly string[]).includes(c.type) ? c.type : 'basic') as TestQuestion['type'];
    const base = { cardId: c.id, prompt: c.front, answer: c.back, keyPoints: c.keyPoints, type };
    // A distractor that means the right answer would mark a correct pick wrong, so equivalents are left out.
    const others: string[] = [];
    for (const o of cards) if (o.id !== c.id && !same(o.back, c.back) && !others.some((x) => same(x, o.back))) others.push(o.back.trim());
    if (EXPLAIN_TYPES.includes(type) || type === 'sequence' || others.length < 3) return { ...base, kind: 'short' as const };
    return { ...base, kind: 'choice' as const, choices: shuffle([c.back, ...shuffle(others, rnd).slice(0, 3)], rnd) };
  });
}
