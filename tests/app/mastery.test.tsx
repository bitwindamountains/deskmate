import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { MasteryView, type MasterySection } from '@/app/(app)/study/mastery/mastery-view';

afterEach(cleanup);

const curve = Array.from({ length: 31 }, (_, day) => ({ day, ifIdle: 1 - day * 0.033, ifReviewedToday: 1 - day * 0.0136 }));
const section = (over: Partial<MasterySection> = {}): MasterySection => ({
  deck: { id: 'd1', title: 'Biology', exam_date: null },
  concepts: [
    { key: 'krebs cycle', label: 'Krebs cycle', deckId: 'd1', cards: 1, strength: 'weak', retrievability: 0.4 },
    { key: 'glycolysis', label: 'Glycolysis', deckId: 'd1', cards: 3, strength: 'strong', retrievability: 0.95 },
  ],
  curve, ...over,
});

test('a concept with & / ? round-trips through the review link', () => {
  const key = 'cells & tissues / why?';
  render(<MasteryView sections={[section({ concepts: [{ key, label: 'Cells & Tissues / why?', deckId: 'd 1', cards: 2, strength: 'shaky', retrievability: 0.8 }] })]} />);
  const href = screen.getByRole('link', { name: /Cells & Tissues/ }).getAttribute('href')!;
  const url = new URL(href, 'https://scholar.example');
  expect(url.pathname).toBe('/study/review');
  expect(url.searchParams.get('deck')).toBe('d 1');
  expect(url.searchParams.get('concept')).toBe(key);
});

test('mastery page shows strength as text and a text summary of the curve', () => {
  render(<MasteryView sections={[section()]} />);
  expect(screen.getByRole('heading', { name: 'Biology', level: 2 })).toBeTruthy();
  const tile = screen.getByRole('link', { name: /Glycolysis/ });
  expect(tile.textContent).toContain('3 cards');
  expect(tile.textContent).toContain('Strong');
  expect(screen.getByRole('link', { name: /Krebs cycle/ }).textContent).toContain('1 card');
  expect(screen.getByRole('link', { name: /Krebs cycle/ }).textContent).toContain('Weak');
  expect(screen.getByText("In 2 weeks you'd remember about 54%; reviewing today keeps it near 81%.")).toBeTruthy();
  expect(screen.getAllByText('If you stop now').length).toBeGreaterThan(0);
  expect(screen.getAllByText("If you review today's cards").length).toBeGreaterThan(0);
  expect(screen.getByText('Show the data table')).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(32);
});

test('a deck with no reviewed cards has no curve yet', () => {
  render(<MasteryView sections={[section({ curve: [] })]} />);
  expect(screen.queryByText(/In 2 weeks/)).toBeNull();
  expect(screen.getByText('Review a few cards to see how your memory holds up.')).toBeTruthy();
});

test('no decks keeps the empty state', () => {
  render(<MasteryView sections={[]} />);
  expect(screen.getByRole('heading', { name: 'Nothing to study yet' })).toBeTruthy();
});

test('arrowing through the forgetting curve announces each day', () => {
  render(<MasteryView sections={[section()]} />);
  const chart = screen.getByRole('img', { name: 'Forgetting curve, next 30 days' });
  fireEvent.focus(chart);
  const status = screen.getByRole('status');
  expect(status.textContent).toMatch(/^Today: \d+% reviewed, \d+% stopped$/);
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(status.textContent).toMatch(/% reviewed, \d+% stopped$/);
  expect(status.textContent).not.toMatch(/^Today/);
  fireEvent.blur(chart);
  expect(status.textContent).toBe('');
});

test('pointer moves over the curve do not announce; only focus and keys do', () => {
  render(<MasteryView sections={[section()]} />);
  const chart = screen.getByRole('img', { name: 'Forgetting curve, next 30 days' });
  fireEvent.pointerMove(chart, { clientX: 200, clientY: 50 });
  expect(screen.getByRole('status').textContent).toBe('');
});
