import { Rating } from 'ts-fsrs';
import type { CardType } from '@/lib/cards/types';
import { normalizeAnswer, similarity } from './grade';
import type { Grade, StateRow } from './schedule';

/** How a card is answered in review. Easier formats are a stepping stone, so they count less (RATING_CAP). */
export type Format = 'choice' | 'blank' | 'typed' | 'reverse';
export type FormatCard = { id: string; type: CardType; front: string; back: string; keyPoints: string[]; concept: string; state: StateRow | null };

const FILLER = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'it', 'is', 'its']);
/** "In the mitochondria" and "Mitochondria " are the same answer: lowercase, drop punctuation and filler words. */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ');
export const sameAnswer = (a: string, b: string) => { const x = norm(a), y = norm(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };

/** A small seeded PRNG (mulberry32), so one question is stable across re-renders and a new seed reshuffles it. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const shuffle = <T,>(xs: T[], rnd: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** FNV-1a over the card id and its review count: the same card on the same review always gets the same options. */
export function seedFor(id: string, reps: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}:${reps}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

const CHOICE_TYPES: CardType[] = ['basic', 'cloze']; // explain-type answers make giveaway options, as in the practice test
const REVERSE_MAX_WORDS = 12;
const WEAK_STABILITY = 7; // days
const BLANK_RIGHT = 0.85;

export const RATING_CAP: Record<Format, Grade> = { choice: Rating.Hard, blank: Rating.Good, typed: Rating.Easy, reverse: Rating.Easy };

/** Up to 3 wrong options: other answers on the same concept first, so they are plausible, then the rest of the deck. */
export function distractors(card: FormatCard, pool: FormatCard[], rnd: () => number): string[] {
  const others = pool.filter((o) => o.id !== card.id);
  const near = shuffle(others.filter((o) => o.concept === card.concept), rnd);
  const far = shuffle(others.filter((o) => o.concept !== card.concept), rnd);
  const out: string[] = [];
  for (const o of [...near, ...far]) {
    if (out.length === 3) break;
    if (!sameAnswer(o.back, card.back) && !out.some((x) => sameAnswer(x, o.back))) out.push(o.back.trim());
  }
  return out;
}

/** The longest key point that appears word for word in the answer and leaves something around it, or null. */
export function blankPart(card: FormatCard): string | null {
  const back = card.back.toLowerCase();
  let best: string | null = null;
  for (const kp of card.keyPoints) {
    const k = kp.trim();
    const at = back.indexOf(k.toLowerCase());
    if (!normalizeAnswer(k) || at < 0 || !normalizeAnswer(card.back.slice(0, at) + card.back.slice(at + k.length))) continue;
    if (!best || k.length > best.length) best = card.back.slice(at, at + k.length);
  }
  return best;
}

export function chooseFormat(card: FormatCard, pool: FormatCard[]): Format {
  const s = card.state;
  const fresh = !s || s.state === 0 || s.state === 3; // new or relearning
  if (fresh && CHOICE_TYPES.includes(card.type) && distractors(card, pool, () => 0).length === 3) return 'choice';
  if ((!s || s.state !== 2 || s.stability < WEAK_STABILITY) && blankPart(card)) return 'blank';
  if (s?.state === 2 && card.type === 'basic' && s.reps % 3 === 2 && card.back.trim().split(/\s+/).length <= REVERSE_MAX_WORDS) return 'reverse';
  return 'typed';
}

export function buildChoice(card: FormatCard, pool: FormatCard[], seed: number): string[] {
  const rnd = random(seed);
  return shuffle([card.back.trim(), ...distractors(card, pool, rnd)], rnd);
}

export function buildBlank(card: FormatCard): { before: string; after: string; expected: string } | null {
  const part = blankPart(card);
  if (!part) return null;
  const at = card.back.indexOf(part);
  return { before: card.back.slice(0, at), after: card.back.slice(at + part.length), expected: part };
}

export const checkBlank = (answer: string, expected: string) =>
  !!normalizeAnswer(answer) && (normalizeAnswer(answer) === normalizeAnswer(expected) || similarity(answer, expected) >= BLANK_RIGHT);

export const suggestFor = (format: Format, right: boolean): Grade => (right ? RATING_CAP[format] : Rating.Again);
export const allowedRatings = (format: Format): Grade[] =>
  [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].filter((g) => g <= RATING_CAP[format]) as Grade[];

// ---------------------------------------------------------------- warm-up round (never scheduled: no review rows, no FSRS state)
export type TrueFalse = { kind: 'tf'; cardId: string; prompt: string; shown: string; answer: string; isTrue: boolean };
export type Matching = { kind: 'match'; pairs: { cardId: string; front: string; back: string }[]; backs: string[] };
export type WarmUpItem = TrueFalse | Matching;

const WARM_UP_SIZE = 10;
const MATCH_SIZE = 4;

/** Up to 10 cards: one matching set of 4 when 4 cards have clearly different answers, the rest true or false (about half false). */
export function buildWarmUp(cards: FormatCard[], seed: number): WarmUpItem[] {
  if (cards.length < 2) return [];
  const rnd = random(seed);
  const picked = shuffle(cards, rnd).slice(0, WARM_UP_SIZE);
  const match: FormatCard[] = [];
  for (const c of picked) if (match.length < MATCH_SIZE && !match.some((m) => sameAnswer(m.back, c.back))) match.push(c);
  const matched = match.length === MATCH_SIZE ? new Set(match.map((m) => m.id)) : new Set<string>();
  const items: WarmUpItem[] = picked.filter((c) => !matched.has(c.id)).map((c) => {
    const wrong = rnd() < 0.5 ? distractors(c, cards, rnd)[0] : undefined;
    return { kind: 'tf', cardId: c.id, prompt: c.front, shown: wrong ?? c.back.trim(), answer: c.back.trim(), isTrue: !wrong };
  });
  if (matched.size) {
    const pairs = match.map((m) => ({ cardId: m.id, front: m.front, back: m.back.trim() }));
    items.splice(Math.floor(items.length / 2), 0, { kind: 'match', pairs, backs: shuffle(pairs.map((p) => p.back), rnd) });
  }
  return items;
}
