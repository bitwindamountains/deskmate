export type TestQuestion = { cardId: string; kind: 'choice' | 'short'; prompt: string; answer: string; choices?: string[];
  keyPoints: string[]; type: 'basic' | 'cloze' | 'why' };
type TestCard = { id: string; front: string; back: string; type: string; keyPoints: string[] };

const MAX_QUESTIONS = 20;
const FILLER = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'it', 'is', 'its']);
/** "In the mitochondria" and "Mitochondria " are the same answer: lowercase, drop punctuation and filler words. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ');
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };

/** A small seeded PRNG (mulberry32), so one test is stable across re-renders and a new seed reshuffles it. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = <T,>(xs: T[], rnd: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** B4.4: a mock test from a deck. Multiple choice draws distractors from other cards' answers; why cards stay short answer. */
export function buildTest(cards: TestCard[], seed: number): TestQuestion[] {
  if (cards.length < 2) return [];
  const rnd = random(seed);
  return shuffle(cards, rnd).slice(0, MAX_QUESTIONS).map((c) => {
    const type = (['basic', 'cloze', 'why'].includes(c.type) ? c.type : 'basic') as TestQuestion['type'];
    const base = { cardId: c.id, prompt: c.front, answer: c.back, keyPoints: c.keyPoints, type };
    // A distractor that means the right answer would mark a correct pick wrong, so equivalents are left out.
    const others: string[] = [];
    for (const o of cards) if (o.id !== c.id && !same(o.back, c.back) && !others.some((x) => same(x, o.back))) others.push(o.back.trim());
    if (type === 'why' || others.length < 3) return { ...base, kind: 'short' as const };
    return { ...base, kind: 'choice' as const, choices: shuffle([c.back, ...shuffle(others, rnd).slice(0, 3)], rnd) };
  });
}
