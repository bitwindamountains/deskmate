import { localMidnight, startOfLocalDay } from '@/lib/time/zone';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard, type FSRS, type ReviewLog } from 'ts-fsrs';
import type { CardType } from '@/lib/cards/types';

export type Grade = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy;
export interface StateRow { card_id: string; due: string; stability: number; difficulty: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: number; last_review: string | null }
export interface StudyCard { id: string; deckId: string; type: CardType; importance: 1 | 2 | 3; state: StateRow | null;
  /** Matched to the deck's course goals (B4.3). */
  goalMatch?: boolean }

/** Scheduling weight: importance, plus one when the card matches the deck's course goals. */
export const weight = (c: StudyCard) => c.importance + (c.goalMatch ? 1 : 0);
export interface SessionOptions { now: Date; minutes: number; newIntroducedToday: number; examDate: Date | null; doMore?: boolean;
  /** The student's daily new-card limit (B2.6); NEW_CARD_LIMIT when unset. */
  newLimit?: number;
  /** The student's zone when this runs on the server (Today plan); omitted on the device. */
  zone?: string }

export const SECONDS_PER_CARD = 25;
export const NEW_CARD_LIMIT = 20;
const DAY_MS = 86400000;

export const DEFAULT_RETENTION = 0.9;
export const makeScheduler = (fuzz: boolean, retention = DEFAULT_RETENTION): FSRS =>
  fsrs(generatorParameters({ request_retention: retention, enable_fuzz: fuzz }));
/**
 * The student's B2.6 settings, checked. preferences is jsonb the user can write directly through the API,
 * so an out-of-range or missing value falls back to the default instead of breaking scheduling.
 */
export function studySettings(p?: { new_cards_per_day?: unknown; retention?: unknown } | null): { newLimit: number; retention: number } {
  const n = p?.new_cards_per_day, r = p?.retention;
  return {
    newLimit: typeof n === 'number' && Number.isInteger(n) && n >= 5 && n <= 100 ? n : NEW_CARD_LIMIT,
    retention: typeof r === 'number' && r >= 0.8 && r <= 0.97 ? r : DEFAULT_RETENTION,
  };
}
const schedulers = new Map<number, FSRS>();
/** One scheduler per target retention (B2.6, the student's setting), built once. */
export function schedulerFor(retention = DEFAULT_RETENTION): FSRS {
  let s = schedulers.get(retention);
  if (!s) schedulers.set(retention, (s = makeScheduler(true, retention)));
  return s;
}
const scheduler = schedulerFor();

// zone: the student's IANA zone when this runs on the server; omitted on the device, where local time is already theirs.
const startOfDay = (d: Date, offsetDays = 0, zone?: string) =>
  (zone ? startOfLocalDay(d, zone, offsetDays) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays));
// Whole local calendar days from now's day to the exam's day (Math.round absorbs DST hour shifts).
/** A YYYY-MM-DD day (an exam_date column) as local midnight. */
export const parseDay = (d: string, zone?: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return zone ? localMidnight(y, m, day, zone) : new Date(y, m - 1, day);
};
export const daysUntil = (exam: Date, now: Date, zone?: string) =>
  Math.round((startOfDay(exam, 0, zone).getTime() - startOfDay(now, 0, zone).getTime()) / DAY_MS);

export function toFsrs(s: StateRow | null, now: Date): FsrsCard {
  if (!s) return createEmptyCard(now);
  return {
    due: new Date(s.due), stability: s.stability, difficulty: s.difficulty, elapsed_days: 0,
    scheduled_days: s.scheduled_days, learning_steps: s.learning_steps, reps: s.reps, lapses: s.lapses,
    state: s.state, last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

export function fromFsrs(cardId: string, c: FsrsCard): StateRow {
  return {
    card_id: cardId, due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty,
    scheduled_days: c.scheduled_days, learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses,
    state: c.state, last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function applyRating(card: StudyCard, rating: Grade, now: Date, examDate: Date | null, f: FSRS = scheduler): { state: StateRow; log: ReviewLog } {
  const { card: next, log } = f.next(toFsrs(card.state, now), now, rating);
  if (examDate && daysUntil(examDate, now) > 0) {
    let cap = startOfDay(examDate, -1);
    if (cap <= now) cap = startOfDay(examDate); // exam tomorrow: a cap in the past would loop the card all day
    if (next.due > cap) {
      next.due = cap;
      next.scheduled_days = Math.max(0, Math.floor((cap.getTime() - now.getTime()) / DAY_MS));
    }
  }
  return { state: fromFsrs(card.id, next), log };
}

export function retrievability(s: StateRow | null, at: Date): number {
  return s ? scheduler.get_retrievability(toFsrs(s, at), at, false) : 0;
}

export function buildSession(cards: StudyCard[], o: SessionOptions): { queue: StudyCard[]; dueCount: number; estMinutes: number } {
  const t = o.now.getTime();
  const days = o.examDate ? daysUntil(o.examDate, o.now, o.zone) : 0;
  const exam = days > 0;
  const priority = (c: StudyCard) => weight(c) * (1 - retrievability(c.state, o.now));

  const byPriority = (a: StudyCard, b: StudyCard) => priority(b) - priority(a);

  const due = cards.filter((c) => c.state && new Date(c.state.due).getTime() <= t);
  const overloaded = exam && (due.length * SECONDS_PER_CARD) / 60 > o.minutes;
  if (overloaded) due.sort(byPriority);
  else due.sort((a, b) => new Date(a.state!.due).getTime() - new Date(b.state!.due).getTime());

  const dueSet = new Set(due);
  const weak = exam && days <= 3
    ? cards.filter((c) => c.state && !dueSet.has(c) && retrievability(c.state, o.now) < 0.8)
    : [];
  if (overloaded) weak.sort(byPriority);

  const fresh = cards.filter((c) => !c.state)
    .sort((a, b) => weight(b) - weight(a)) // stable sort keeps input order on ties
    .slice(0, Math.max(0, (o.newLimit ?? NEW_CARD_LIMIT) - o.newIntroducedToday));

  let queue = [...due, ...weak, ...fresh];
  if (!o.doMore) queue = queue.slice(0, Math.floor((o.minutes * 60) / SECONDS_PER_CARD));
  return { queue, dueCount: due.length, estMinutes: Math.ceil((queue.length * SECONDS_PER_CARD) / 60) };
}

export function readiness(cards: StudyCard[], examDate: Date): number {
  if (!cards.length) return 0;
  return cards.reduce((sum, c) => sum + retrievability(c.state, examDate), 0) / cards.length;
}

export function newCardCapacity(newCount: number, daysLeft: number, minutes: number): number {
  // a new card needs about 3 reviews before an exam
  return Math.min(newCount, Math.max(0, Math.floor((daysLeft * minutes * 60) / SECONDS_PER_CARD / 3)));
}

/** The earliest upcoming review day and how many cards fall due by the end of it. */
export function nextReview(cards: StudyCard[], now: Date, zone?: string): { label: string; count: number } | null {
  const dues = cards.flatMap((c) => (c.state ? [new Date(c.state.due)] : []));
  if (!dues.length) return null;
  const first = new Date(Math.min(...dues.map((d) => d.getTime())));
  const day = first < now ? startOfDay(now, 0, zone) : startOfDay(first, 0, zone);
  const end = day.getTime() + DAY_MS;
  const days = Math.round((day.getTime() - startOfDay(now, 0, zone).getTime()) / DAY_MS);
  const label = days === 0 ? 'today' : days === 1 ? 'tomorrow'
    : days < 7 ? day.toLocaleDateString('en', { weekday: 'long', timeZone: zone }) : day.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: zone });
  return { label, count: dues.filter((d) => d.getTime() < end).length };
}
