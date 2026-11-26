import { CARD_TYPES, EXPLAIN_TYPES, type CardType } from '@/lib/cards/types';
import { random, shuffle, wrongOptions } from './formats';
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
    // wrongOptions leaves out answers that mean the right one (picking it would be marked wrong) and ones shaped unlike it.
    const wrong = wrongOptions(c.back, cards.filter((o) => o.id !== c.id).map((o) => ({ text: o.back, near: true })), rnd);
    if (EXPLAIN_TYPES.includes(type) || type === 'sequence' || wrong.length < 3) return { ...base, kind: 'short' as const };
    return { ...base, kind: 'choice' as const, choices: shuffle([c.back, ...wrong], rnd) };
  });
}
