import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { DeckList, type DeckSummary } from '@/app/(app)/study/decks';

const deck = (over: Partial<DeckSummary> = {}): DeckSummary =>
  ({ id: 'd1', title: 'Biology', exam_date: null, kept: 12, due: 3, fresh: 4, triage: [], ...over });
afterEach(cleanup);

test('a deck shows its counts and a link to set an exam date', () => {
  render(<DeckList decks={[deck()]} />);
  expect(screen.getByRole('heading', { name: 'Biology', level: 3 })).toBeTruthy();
  expect(screen.getByText('12 cards · 3 due · 4 new')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Set Biology exam date' }).getAttribute('href')).toBe('/study/deck/d1/exam');
  expect(screen.getByRole('link', { name: 'Import material' }).getAttribute('href')).toBe('/study/import');
});

test('a deck with an exam shows the date and a change link', () => {
  render(<DeckList decks={[deck({ exam_date: '2026-11-14' })]} />);
  expect(screen.getByText(/^Exam: Sat, Nov 14/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Change Biology exam date' })).toBeTruthy();
});

test('cards waiting for triage link back to their source', () => {
  render(<DeckList decks={[deck({ kept: 0, triage: [{ sourceId: 's1', title: 'Chapter 3', pending: 5 }] })]} />);
  expect(screen.getByText('0 cards')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sort 5 new cards from Chapter 3' }).getAttribute('href')).toBe('/study/triage/s1');
});

test('no decks keeps the empty state', () => {
  render(<DeckList decks={[]} />);
  expect(screen.getByRole('heading', { name: 'Nothing to study yet' })).toBeTruthy();
});
