import { startOfLocalDay } from '@/lib/time/zone';
import { Rating } from 'ts-fsrs';
import type { ReviewCard } from '@/lib/review/load';
import { applyRating, makeScheduler, retrievability } from './schedule';

export type Strength = 'strong' | 'shaky' | 'weak' | 'not started';
export type ConceptMastery = { key: string; label: string; deckId: string; cards: number; strength: Strength; retrievability: number | null };
export type CurvePoint = { day: number; ifIdle: number; ifReviewedToday: number };

const DAY_MS = 86400000;
const noFuzz = makeScheduler(false);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const strengthOf = (r: number | null): Strength => (r === null ? 'not started' : r >= 0.9 ? 'strong' : r >= 0.7 ? 'shaky' : 'weak');

/** Concepts grouped by deck (first-seen order) then by trimmed, lower-cased name; weakest first, not started last. */
export function conceptMastery(cards: ReviewCard[], now: Date): ConceptMastery[] {
  const groups = new Map<string, { deckId: string; key: string; spellings: Map<string, number>; cards: ReviewCard[] }>();
  for (const c of cards) {
    const label = c.concept.trim();
    const key = label.toLowerCase();
    const id = `${c.deckId}\n${key}`;
    const g = groups.get(id) ?? { deckId: c.deckId, key, spellings: new Map<string, number>(), cards: [] as ReviewCard[] };
    g.spellings.set(label, (g.spellings.get(label) ?? 0) + 1);
    g.cards.push(c);
    groups.set(id, g);
  }
  const deckOrder = [...new Set(cards.map((c) => c.deckId))];
  return [...groups.values()].map((g): ConceptMastery => {
    const reviewed = g.cards.filter((c) => c.state);
    const r = reviewed.length ? mean(reviewed.map((c) => retrievability(c.state, now))) : null;
    // Map keeps insertion order, so ties go to the first spelling seen
    const label = [...g.spellings].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    return { key: g.key, label, deckId: g.deckId, cards: g.cards.length, strength: strengthOf(r), retrievability: r };
  }).sort((a, b) => deckOrder.indexOf(a.deckId) - deckOrder.indexOf(b.deckId)
    || (a.retrievability ?? Infinity) - (b.retrievability ?? Infinity));
}

/** Mean retrievability of the reviewed cards for each of the next `days` days, idle vs. after a Good on everything due today. */
export function forgettingCurve(cards: ReviewCard[], now: Date, days = 30, zone = 'UTC'): CurvePoint[] {
  const reviewed = cards.filter((c) => c.state);
  if (!reviewed.length) return [];
  // "Today" is the student's day: the server runs in UTC, the student may not.
  const endOfToday = startOfLocalDay(now, zone, 1).getTime();
  const after = reviewed.map((c) => (new Date(c.state!.due).getTime() < endOfToday ? applyRating(c, Rating.Good, now, null, noFuzz).state : c.state));
  return Array.from({ length: days + 1 }, (_, day) => {
    const at = new Date(now.getTime() + day * DAY_MS);
    return { day, ifIdle: mean(reviewed.map((c) => retrievability(c.state, at))), ifReviewedToday: mean(after.map((s) => retrievability(s, at))) };
  });
}
