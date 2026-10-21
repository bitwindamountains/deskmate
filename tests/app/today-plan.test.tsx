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
  ({ id, deckId, type: 'basic', importance: 2, state: s, front: 'F', back: 'B', keyPoints: [] });
const deck = (id: string, title: string, exam_date: string | null = null): Deck => ({ id, title, exam_date });
const plan = (decks: Deck[], cards: ReviewCard[]) =>
  render(<TodayPlan decks={decks} cards={cards} minutes={20} newIntroducedToday={0} now={now} />);
afterEach(cleanup);

test('Today shows due count with minutes at 25 s per card and a Start link', () => {
  plan([deck('bio', 'Biology')], Array.from({ length: 18 }, (_, i) => card(`c${i}`, state(`c${i}`, day(-1)))));
  expect(screen.getByText('18 cards · ~8 min')).toBeTruthy();
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

test('with no cards, Today keeps the empty state', () => {
  plan([], []);
  expect(screen.getByRole('heading', { name: 'Nothing to study yet' })).toBeTruthy();
});
