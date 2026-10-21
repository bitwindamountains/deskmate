import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReviewCard } from '@/lib/review/load';

const card = (id: string, deckId: string, concept: string): ReviewCard =>
  ({ id, deckId, type: 'basic', importance: 2, state: null, front: `Front ${id}`, back: 'B', keyPoints: [], concept });
const cards = [card('a', 'd1', 'Glycolysis'), card('b', 'd1', ' glycolysis '), card('c', 'd1', 'Krebs & ETC'), card('d', 'd2', 'Glycolysis')];

vi.mock('@/lib/profile/require', () => ({ requireOnboardedUser: async () => ({ userId: 'u1', profile: { study_minutes_per_day: 20 } }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/review/load', () => ({ loadStudy: async () => ({ decks: [{ id: 'd1', title: 'Bio', exam_date: null }, { id: 'd2', title: 'Chem', exam_date: null }], cards, newIntroducedToday: 0 }) }));
vi.mock('@/app/(app)/study/review/session', () => ({
  ReviewSession: ({ cards: c }: { cards: ReviewCard[] }) => <ul>{c.map((x) => <li key={x.id}>{x.id}</li>)}</ul>,
}));

import ReviewPage from '@/app/(app)/study/review/page';

afterEach(cleanup);
const ids = () => screen.getAllByRole('listitem').filter((li) => li.closest('main')).map((li) => li.textContent);

test("a concept-focused session only shows that concept's cards and names it in the heading", async () => {
  render(await ReviewPage({ searchParams: Promise.resolve({ deck: 'd1', concept: 'glycolysis' }) }));
  expect(ids()).toEqual(['a', 'b']);
  expect(screen.getByRole('heading', { level: 1, name: 'Review: Glycolysis' })).toBeTruthy();
});

test('a concept with & round-trips from the mastery link', async () => {
  render(await ReviewPage({ searchParams: Promise.resolve({ deck: 'd1', concept: decodeURIComponent(encodeURIComponent('krebs & etc')) }) }));
  expect(ids()).toEqual(['c']);
});

test('without filters every card is reviewed under the plain heading', async () => {
  render(await ReviewPage({ searchParams: Promise.resolve({}) }));
  expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeTruthy();
});
