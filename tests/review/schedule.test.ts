import { expect, test } from 'vitest';
import { Rating } from 'ts-fsrs';
import {
  applyRating, buildSession, daysUntil, makeScheduler, NEW_CARD_LIMIT, newCardCapacity, nextReview, parseDay, readiness, retrievability,
  type StateRow, type StudyCard,
} from '@/review/schedule';

const now = new Date('2026-11-02T09:00:00');
const noFuzz = makeScheduler(false);
const day = (n: number) => new Date(now.getTime() + n * 86400000);

// A mature review card last seen 30 days ago, due now.
const mature = (id: string, stability = 30): StateRow => ({
  card_id: id, due: now.toISOString(), stability, difficulty: 5, scheduled_days: 30, learning_steps: 0,
  reps: 6, lapses: 0, state: 2, last_review: day(-30).toISOString(),
});
const card = (id: string, state: StateRow | null, importance: 1 | 2 | 3 = 2): StudyCard =>
  ({ id, deckId: 'd', type: 'basic', importance, state });

test('new card rated Good gets a future due date', () => {
  const { state } = applyRating(card('a', null), Rating.Good, now, null, noFuzz);
  expect(new Date(state.due).getTime()).toBeGreaterThan(now.getTime());
  expect(state.card_id).toBe('a');
  expect(state.reps).toBe(1);
});

test('exam in 5 days caps due at the day before the exam', () => {
  const free = applyRating(card('a', mature('a')), Rating.Good, now, null, noFuzz).state;
  expect(free.scheduled_days).toBeGreaterThanOrEqual(30);
  const { state } = applyRating(card('a', mature('a')), Rating.Good, now, new Date('2026-11-07T00:00:00'), noFuzz);
  expect(new Date(state.due).getTime()).toBe(new Date('2026-11-06T00:00:00').getTime());
  expect(state.scheduled_days).toBe(3);
});

test('exam today or past is ignored', () => {
  const free = applyRating(card('a', mature('a')), Rating.Good, now, null, noFuzz).state;
  for (const exam of [new Date('2026-11-02T00:00:00'), new Date('2026-10-01T00:00:00')]) {
    const { state } = applyRating(card('a', mature('a')), Rating.Good, now, exam, noFuzz);
    expect(state.due).toBe(free.due);
    expect(state.scheduled_days).toBe(free.scheduled_days);
  }
});

const opts = { now, minutes: 10, newIntroducedToday: 0, examDate: null };
const news = Array.from({ length: 40 }, (_, i) => card(`n${i}`, null, ((i % 3) + 1) as 1 | 2 | 3));
const dues = Array.from({ length: 10 }, (_, i) => card(`r${i}`, mature(`r${i}`)));

test('session respects the new-card limit and minutes cap', () => {
  const s = buildSession([...news, ...dues], opts);
  expect(s.queue.length).toBe(24);
  expect(s.dueCount).toBe(10);
  expect(s.queue.slice(0, 10).every((c) => c.state)).toBe(true);
  expect(s.queue.filter((c) => !c.state).length).toBeLessThanOrEqual(NEW_CARD_LIMIT);
  // highest importance first, ties keep input order
  const firstNew = s.queue.slice(10);
  expect(firstNew.map((c) => c.importance)).toEqual([...Array(13).fill(3), 2]);
  expect(firstNew[0].id).toBe('n2');
  expect(buildSession(news, { ...opts, newIntroducedToday: 25 }).queue.length).toBe(0);
  expect(buildSession(news, { ...opts, newIntroducedToday: 15 }).queue.length).toBe(5);
});

test('doMore lifts the minutes cap but not the new-card limit', () => {
  const s = buildSession([...news, ...dues], { ...opts, doMore: true });
  expect(s.queue.length).toBe(30);
  expect(s.queue.filter((c) => !c.state).length).toBe(NEW_CARD_LIMIT);
});

test('exam priority ranks importance × (1 − R) when overloaded', () => {
  // older due date but low importance and high R vs newer due, high importance, low R
  const early = card('early', { ...mature('early', 200), due: day(-5).toISOString() }, 1);
  const weak = card('weak', { ...mature('weak', 2), due: day(-1).toISOString() }, 3);
  const filler = Array.from({ length: 30 }, (_, i) => card(`f${i}`, { ...mature(`f${i}`, 100), due: day(-2).toISOString() }, 1));
  const examDate = new Date('2026-11-20T00:00:00');
  const exam = buildSession([early, weak, ...filler], { ...opts, minutes: 5, examDate });
  expect(exam.queue[0].id).toBe('weak');
  const plain = buildSession([early, weak, ...filler], { ...opts, minutes: 5 });
  expect(plain.queue[0].id).toBe('early');
  // not overloaded → due ascending even in exam mode
  expect(buildSession([early, weak], { ...opts, examDate }).queue.map((c) => c.id)).toEqual(['early', 'weak']);
});

test('final 3 days include weak kept cards that are not due', () => {
  const weakKept = card('k', { ...mature('k', 1), due: day(10).toISOString(), last_review: day(-5).toISOString() });
  const strongKept = card('s', { ...mature('s', 500), due: day(10).toISOString(), last_review: day(-1).toISOString() });
  expect(retrievability(weakKept.state, now)).toBeLessThan(0.8);
  expect(retrievability(strongKept.state, now)).toBeGreaterThan(0.8);
  const final = buildSession([weakKept, strongKept], { ...opts, examDate: new Date('2026-11-04T00:00:00') });
  expect(final.queue.map((c) => c.id)).toEqual(['k']);
  expect(buildSession([weakKept, strongKept], { ...opts, examDate: new Date('2026-11-20T00:00:00') }).queue).toEqual([]);
});

test('readiness of all-new deck is 0 and estMinutes uses 25 s per card', () => {
  expect(readiness(news, new Date('2026-11-20T00:00:00'))).toBe(0);
  expect(retrievability(null, now)).toBe(0);
  const r = readiness(dues, new Date('2026-11-20T00:00:00'));
  expect(r).toBeGreaterThan(0);
  expect(r).toBeLessThan(1);
  const s = buildSession(news.slice(0, 12), opts); // 12 × 25 s = 300 s
  expect(s.estMinutes).toBe(5);
  expect(newCardCapacity(100, 6, 10)).toBe(48); // floor(6*10*60/25/3)
  expect(newCardCapacity(30, 6, 10)).toBe(30);
});

test('exam tomorrow caps a mature card at the start of exam day, short steps untouched', () => {
  const exam = new Date('2026-11-03T00:00:00');
  const { state } = applyRating(card('a', mature('a')), Rating.Good, now, exam, noFuzz);
  expect(new Date(state.due).getTime()).toBe(exam.getTime());
  expect(Number.isInteger(state.scheduled_days)).toBe(true);
  expect(state.scheduled_days).toBeGreaterThanOrEqual(0);
  const again = applyRating(card('n', null), Rating.Again, now, exam, noFuzz).state;
  const free = applyRating(card('n', null), Rating.Again, now, null, noFuzz).state;
  expect(again.due).toBe(free.due);
  expect(new Date(again.due).getTime()).toBeGreaterThan(now.getTime());
});

test('final-days mode starts exactly 3 days before the exam', () => {
  const weakKept = card('k', { ...mature('k', 1), due: day(10).toISOString(), last_review: day(-5).toISOString() });
  expect(buildSession([weakKept], { ...opts, examDate: new Date('2026-11-05T00:00:00') }).queue.map((c) => c.id)).toEqual(['k']);
  expect(buildSession([weakKept], { ...opts, examDate: new Date('2026-11-06T00:00:00') }).queue).toEqual([]);
});

test('with a zone, exam days and the next review are counted on the student calendar, not the server one', () => {
  // 23:00 UTC on Oct 22 is 07:00 on Oct 23 in Manila.
  const now = new Date('2026-10-22T23:00:00Z');
  const exam = parseDay('2026-10-25', 'Asia/Manila');
  expect(exam.toISOString()).toBe('2026-10-24T16:00:00.000Z'); // Manila midnight of the exam day
  expect(daysUntil(exam, now, 'Asia/Manila')).toBe(2);
  // A card due at 09:00 Manila on Oct 23 (01:00 UTC) is due "today" for that student.
  const card = { id: 'c', deckId: 'd', type: 'basic' as const, importance: 2 as const, state: { card_id: 'c', due: '2026-10-23T01:00:00.000Z', stability: 3, difficulty: 5,
    scheduled_days: 3, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: '2026-10-20T01:00:00.000Z' } };
  expect(nextReview([card], now, 'Asia/Manila')).toEqual({ label: 'today', count: 1 });
  expect(nextReview([card], now, 'UTC')?.label).toBe('tomorrow');
});

test('an exam date is read as that zone midnight, even at the far ends (UTC+14, UTC-11)', () => {
  expect(parseDay('2026-10-25', 'Pacific/Kiritimati').toISOString()).toBe('2026-10-24T10:00:00.000Z');
  expect(parseDay('2026-10-25', 'Pacific/Pago_Pago').toISOString()).toBe('2026-10-25T11:00:00.000Z');
});
