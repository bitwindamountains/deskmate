import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReviewCard } from '@/lib/review/load';

const update = vi.fn();
const getClaims = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims },
    from: () => ({
      update: (v: unknown) => {
        const result = update(v);
        const q = { eq: () => q, select: async () => result };
        return q;
      },
    }),
  }),
}));
vi.mock('@/lib/profile/is-onboarded', () => ({ isOnboarded: async () => true }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));

import { setExamDate } from '@/app/(app)/study/deck/[deckId]/exam/actions';
import { ExamSetup } from '@/app/(app)/study/deck/[deckId]/exam/exam-setup';

const DECK = '11111111-1111-4111-8111-111111111111';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86400000));
const fresh = (n: number): ReviewCard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, deckId: DECK, type: 'basic', importance: 2, state: null, front: 'F', back: 'B', keyPoints: [], concept: 'c' }));

beforeEach(() => {
  getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } } });
  update.mockReturnValue({ data: [{ id: DECK }], error: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('exam setup shows the capacity line when new cards exceed capacity', () => {
  render(<ExamSetup deckId={DECK} examDate={inDays(3)} cards={fresh(80)} minutes={20} />);
  // 3 days x 20 min x 60 s / 25 s per card / 3 reviews per new card = 48
  expect(screen.getByText('At 20 minutes a day you can start about 48 of the 80 new cards before the exam. The most important ones come first.')).toBeTruthy();
  expect(screen.getByText(/remember about 0% of this deck on exam day/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove exam date' })).toBeTruthy();
});

test('no capacity line when every new card fits', () => {
  render(<ExamSetup deckId={DECK} examDate={inDays(30)} cards={fresh(10)} minutes={20} />);
  expect(screen.queryByText(/you can start about/)).toBeNull();
});

test('no exam date set: no forecast and no remove button', () => {
  render(<ExamSetup deckId={DECK} examDate={null} cards={fresh(10)} minutes={20} />);
  expect(screen.queryByRole('heading', { name: 'Forecast' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove exam date' })).toBeNull();
});

test('setExamDate rejects a past date', async () => {
  expect(await setExamDate(DECK, '2020-01-01')).toEqual({ ok: false, error: 'Pick a date from today onward.' });
  expect(update).not.toHaveBeenCalled();
});

test('setExamDate saves a future date, clears with null, and rejects bad input', async () => {
  expect(await setExamDate(DECK, inDays(10))).toEqual({ ok: true });
  expect(update).toHaveBeenLastCalledWith({ exam_date: inDays(10) });
  expect(await setExamDate(DECK, null)).toEqual({ ok: true });
  expect(update).toHaveBeenLastCalledWith({ exam_date: null });
  expect(await setExamDate('not-a-uuid', null)).toEqual({ ok: false, error: "We couldn't save that change." });
  expect(await setExamDate(DECK, '2026-02-31')).toEqual({ ok: false, error: "We couldn't save that change." });
});

test('setExamDate for a deck that is not yours finds nothing', async () => {
  update.mockReturnValue({ data: [], error: null });
  expect(await setExamDate(DECK, null)).toEqual({ ok: false, error: "We couldn't find that deck." });
});

test('removing the exam date from the form calls the action with null', async () => {
  render(<ExamSetup deckId={DECK} examDate={inDays(3)} cards={fresh(1)} minutes={20} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove exam date' }));
  await waitFor(() => expect(screen.getByText('Exam date removed.')).toBeTruthy());
  expect(update).toHaveBeenLastCalledWith({ exam_date: null });
});
