import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { WarmUp } from '@/app/(app)/study/warm-up/warm-up';
import { buildWarmUp, type FormatCard, type Matching, type TrueFalse } from '@/review/formats';
import { db } from '@/review/store';

const card = (n: number): FormatCard => ({ id: `c${n}`, type: 'basic', front: `Question ${n}?`, back: `Answer ${n}`, keyPoints: [],
  concept: 'c', state: null });
const cards = Array.from({ length: 6 }, (_, n) => card(n));
const SEED = 5;
const items = buildWarmUp(cards, SEED);
const fetchMock = vi.fn();

beforeEach(async () => { vi.stubGlobal('fetch', fetchMock); await db.delete(); await db.open(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

function answerTrueFalse(q: TrueFalse, right: boolean) {
  fireEvent.click(screen.getByRole('button', { name: q.isTrue === right ? 'True' : 'False' }));
  expect(screen.getByText(right ? 'Right.' : 'Not quite.')).toBeTruthy();
  if (!q.isTrue) expect(screen.getByText('The answer is:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function answerMatching(m: Matching, missFirst: boolean) {
  const questions = screen.getByRole('group', { name: 'Questions' });
  const answers = screen.getByRole('group', { name: 'Answers' });
  m.pairs.forEach((p, k) => {
    if (missFirst && k === 0) {
      fireEvent.click(questions.querySelector(`button:nth-child(${k + 1})`)!);
      fireEvent.click(screen.getByRole('button', { name: m.pairs[1].back }));
      expect(screen.getByText('Not a match. Try again.')).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: p.front }));
    fireEvent.click(screen.getByRole('button', { name: p.back }));
  });
  expect(answers.querySelectorAll('button:disabled')).toHaveLength(m.pairs.length);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

test('a warm-up mixes true or false with matching, scores first tries, and writes nothing', async () => {
  expect(items.some((x) => x.kind === 'match')).toBe(true);
  render(<WarmUp cards={cards} seed={SEED} />);
  let expected = 0;
  let total = 0;
  items.forEach((x, k) => {
    if (x.kind === 'tf') { const ok = k % 2 === 0; answerTrueFalse(x, ok); expected += ok ? 1 : 0; total += 1; }
    else { answerMatching(x, true); expected += x.pairs.length - 1; total += x.pairs.length; }
  });
  expect(screen.getByRole('heading', { name: `Warm-up done: ${expected} of ${total} right.` })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Start review' }).getAttribute('href')).toBe('/study/review');
  expect(await db.outbox.count()).toBe(0);
  expect(await db.states.count()).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a warm-up needs at least 2 cards', () => {
  render(<WarmUp cards={[card(1)]} seed={1} />);
  expect(screen.getByText('A warm-up needs at least 2 cards.')).toBeTruthy();
});
