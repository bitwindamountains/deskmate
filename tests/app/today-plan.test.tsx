import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TodayPlan } from '@/app/(app)/today/plan';
import type { Deck, ReviewCard } from '@/lib/review/load';
import type { StateRow } from '@/review/schedule';

const now = new Date('2026-11-02T09:00:00');
const day = (n: number) => new Date(now.getTime() + n * 86400000);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const state = (id: string, due: Date, stability = 30): StateRow => ({
  card_id: id, due: due.toISOString(), stability, difficulty: 5, scheduled_days: 30, learning_steps: 0, reps: 5, lapses: 0, state: 2,
  last_review: day(-30).toISOString(),
});
const card = (id: string, s: StateRow | null, deckId = 'bio'): ReviewCard =>
  ({ id, deckId, type: 'basic', importance: 2, state: s, front: 'F', back: 'B', keyPoints: [], concept: 'c' });
const deck = (id: string, title: string, exam_date: string | null = null): Deck => ({ id, title, exam_date });
type EssayLine = { id: string; title: string; openTop3: number };
const plan = (decks: Deck[], cards: ReviewCard[], essays: EssayLine[] = []) =>
  render(<TodayPlan decks={decks} cards={cards} minutes={20} newIntroducedToday={0} now={now} essays={essays} />);
afterEach(cleanup);

test('Today shows due count with minutes at 25 s per card and a Start link', () => {
  plan([deck('bio', 'Biology')], Array.from({ length: 18 }, (_, i) => card(`c${i}`, state(`c${i}`, day(-1)))));
  expect(screen.getByText('18 cards')).toBeTruthy();
  expect(screen.getAllByText('~8 min').length).toBeGreaterThan(0);
  expect(screen.getByText('~8 of 20 min')).toBeTruthy(); // the tape: review against the daily minutes
  expect(screen.getByRole('link', { name: 'Start' }).getAttribute('href')).toBe('/study/review');
});

test('Today shows an exam countdown with readiness percent', () => {
  plan([deck('bio', 'Biology', ymd(day(12))), deck('chem', 'Chemistry')], [card('a', state('a', day(5)))]);
  expect(screen.getByText(/^Biology exam in 12 days · \d+% ready$/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Change Biology exam date' }).getAttribute('href')).toBe('/study/deck/bio/exam');
  expect(screen.getByRole('link', { name: 'Set an exam date for Chemistry' }).getAttribute('href')).toBe('/study/deck/chem/exam');
});

test('a past exam shows no countdown', () => {
  plan([deck('bio', 'Biology', ymd(day(-2)))], [card('a', state('a', day(5)))]);
  expect(screen.queryByText(/exam in/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Set an exam date for Biology' })).toBeTruthy();
});

test('Today shows all caught up when nothing is due', () => {
  const cards = [card('a', state('a', day(1))), card('b', state('b', day(1))), card('c', state('c', day(4)))];
  plan([deck('bio', 'Biology')], cards);
  expect(screen.getByText("You're all caught up. Next review: tomorrow, about 2 cards.")).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Start' })).toBeNull();
});

test('a new student with nothing yet can start either tool (C4)', () => {
  plan([], []);
  expect(screen.getByRole('heading', { name: 'Where would you like to start?' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Get feedback on an essay' }).getAttribute('href')).toBe('/write/new');
  expect(screen.getByRole('link', { name: 'Turn notes into flashcards' }).getAttribute('href')).toBe('/study/import');
});

test('Today lists an essay with open priorities after reviews and before exams', () => {
  plan([deck('bio', 'Biology', ymd(day(12)))], [card('a', state('a', day(-1)))], [{ id: 'e1', title: 'Climate', openTop3: 2 }]);
  const link = screen.getByRole('link', { name: 'Climate · 2 of 3 priorities open' });
  expect(link.getAttribute('href')).toBe('/write/e1');
  const order = [screen.getByRole('heading', { name: 'Reviews' }), link, screen.getByRole('heading', { name: 'Exams' })];
  for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Keep revising' })).toBeNull();
});

test('with no reviews due, the essay becomes the primary card with Keep revising', () => {
  plan([deck('bio', 'Biology')], [card('a', state('a', day(3)))], [{ id: 'e1', title: 'Climate', openTop3: 3 }, { id: 'e2', title: 'Hamlet', openTop3: 1 }]);
  const primary = screen.getByRole('link', { name: 'Keep revising' });
  expect(primary.getAttribute('href')).toBe('/write/e1');
  expect(primary.className).toContain('btn-primary');
  expect(screen.getByText(/^You're all caught up\./)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Hamlet · 1 of 3 priorities open' })).toBeTruthy();
});

test('essays alone, with no cards yet, still show instead of the empty state', () => {
  plan([], [], [{ id: 'e1', title: 'Climate', openTop3: 1 }]);
  expect(screen.queryByRole('heading', { name: 'Nothing to study yet' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Keep revising' })).toBeTruthy();
});

test('Today counts days and the next review on the student calendar when given their zone', () => {
  // 23:00 UTC on Oct 22 is 07:00 on Oct 23 in Manila.
  const at = new Date('2026-10-22T23:00:00Z');
  const s: StateRow = { card_id: 'm', due: '2026-10-23T01:00:00.000Z', stability: 30, difficulty: 5, scheduled_days: 3, learning_steps: 0, reps: 5,
    lapses: 0, state: 2, last_review: '2026-10-20T01:00:00.000Z' };
  const show = (zone: string) => render(<TodayPlan decks={[deck('bio', 'Biology', '2026-10-25')]} cards={[card('m', s)]} minutes={20}
    newIntroducedToday={0} now={at} zone={zone} />);
  show('Asia/Manila');
  expect(screen.getByText(/Next review: today/)).toBeTruthy();
  expect(screen.getByText(/in 2 days/)).toBeTruthy();
  cleanup();
  show('UTC');
  expect(screen.getByText(/Next review: tomorrow/)).toBeTruthy();
  expect(screen.getByText(/in 3 days/)).toBeTruthy();
});

test('more new cards than the daily limit: Today says how many start later, and why (B7)', () => {
  const fresh = Array.from({ length: 50 }, (_, i) => card(`n${i}`, null));
  render(<TodayPlan decks={[deck('bio', 'Bio')]} cards={fresh} minutes={20} newIntroducedToday={0} now={now} newLimit={20} />);
  expect(screen.getByText('30 more new cards start on later days. Up to 20 new cards a day keeps your reviews manageable.')).toBeTruthy();
});

test('within the limit, no limit note', () => {
  plan([deck('bio', 'Bio')], [card('a', null), card('b', null)]);
  expect(screen.queryByText(/start on later days/)).toBeNull();
});

test('caught up because the daily limit is reached: Today still says why new cards wait', () => {
  const fresh = Array.from({ length: 40 }, (_, i) => card(`n${i}`, null));
  render(<TodayPlan decks={[deck('bio', 'Bio')]} cards={fresh} minutes={20} newIntroducedToday={20} now={now} newLimit={20} />);
  expect(screen.getByText(/all caught up/)).toBeTruthy();
  expect(screen.getByText('40 more new cards start on later days. Up to 20 new cards a day keeps your reviews manageable.')).toBeTruthy();
});
