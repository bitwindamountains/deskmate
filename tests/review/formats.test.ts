import { Rating } from 'ts-fsrs';
import { expect, test } from 'vitest';
import { allowedRatings, blankPart, buildBlank, buildChoice, checkBlank, chooseFormat, seedFor, suggestFor, type FormatCard } from '@/review/formats';
import type { StateRow } from '@/review/schedule';

const state = (over: Partial<StateRow>): StateRow => ({ card_id: 'x', due: '2026-10-25T00:00:00.000Z', stability: 30, difficulty: 5,
  scheduled_days: 30, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: '2026-10-01T00:00:00.000Z', ...over });
const card = (n: number, over: Partial<FormatCard> = {}): FormatCard => ({ id: `c${n}`, type: 'basic', front: `Question ${n}?`,
  back: `Answer ${n}`, keyPoints: [], concept: 'cells', state: null, ...over });
const deck = [card(1), card(2), card(3), card(4), card(5)];

test('a new or relearning card with 3 distractors gets multiple choice', () => {
  expect(chooseFormat(deck[0], deck)).toBe('choice');
  expect(chooseFormat({ ...deck[0], state: state({ state: 3 }) }, deck)).toBe('choice');
});

test('choice falls through when the deck is too small or the type explains', () => {
  expect(chooseFormat(deck[0], deck.slice(0, 3))).toBe('typed');
  expect(chooseFormat({ ...deck[0], type: 'why' }, deck)).toBe('typed');
  expect(chooseFormat({ ...deck[0], type: 'application' }, deck)).toBe('typed');
  // falls through to a blank when the card has one
  const kp = { ...deck[0], back: 'In the cytoplasm', keyPoints: ['cytoplasm'] };
  expect(chooseFormat(kp, deck.slice(0, 3))).toBe('blank');
});

test('a learning or weak card with a key point in its answer gets a blank', () => {
  const c = card(1, { back: 'Glycolysis happens in the Cytoplasm', keyPoints: ['cytoplasm'] });
  expect(chooseFormat({ ...c, state: state({ state: 1, stability: 1 }) }, deck)).toBe('blank');
  expect(chooseFormat({ ...c, state: state({ stability: 3 }) }, deck)).toBe('blank');
  expect(chooseFormat({ ...c, state: state({ stability: 30 }) }, deck)).toBe('typed');
  expect(chooseFormat({ ...c, keyPoints: ['ribosome'], state: state({ state: 1 }) }, deck)).toBe('typed');
});

test('a strong basic card with a short answer is reversed every third review', () => {
  const c = card(1, { state: state({ reps: 5 }) });
  expect(chooseFormat(c, deck)).toBe('reverse');
  expect(chooseFormat({ ...c, state: state({ reps: 6 }) }, deck)).toBe('typed');
  expect(chooseFormat({ ...c, type: 'cloze' }, deck)).toBe('typed');
  expect(chooseFormat({ ...c, back: 'one two three four five six seven eight nine ten eleven twelve thirteen' }, deck)).toBe('typed');
});

test('choice options hold the answer once, no equivalent, prefer the same concept, and are seed-stable', () => {
  const pool = [card(1, { back: 'Mitochondria' }), card(2, { back: 'In the mitochondria' }), card(3, { back: 'Nucleus', concept: 'other' }),
    card(4, { back: 'Ribosome' }), card(5, { back: 'Golgi body' }), card(6, { back: 'Lysosome' })];
  const o = buildChoice(pool[0], pool, 7);
  expect(o).toHaveLength(4);
  expect(o.filter((x) => /mitochondria/i.test(x))).toEqual(['Mitochondria']);
  expect(o).not.toContain('Nucleus'); // three same-concept answers exist, so the other concept isn't needed
  expect(buildChoice(pool[0], pool, 7)).toEqual(o);
  expect(seedFor('c1', 2)).toBe(seedFor('c1', 2));
  expect(seedFor('c1', 2)).not.toBe(seedFor('c1', 3));
});

test('the blank is the longest key point found in the answer, matched without case', () => {
  const c = card(1, { back: 'ATP synthase turns as Protons flow down their gradient', keyPoints: ['protons', 'protons flow down their gradient', 'oxygen'] });
  expect(blankPart(c)).toBe('Protons flow down their gradient');
  expect(buildBlank(c)).toEqual({ before: 'ATP synthase turns as ', after: '', expected: 'Protons flow down their gradient' });
  // a key point that is the whole answer leaves nothing to fill around
  expect(blankPart(card(2, { back: 'Cytoplasm', keyPoints: ['cytoplasm'] }))).toBeNull();
});

test('a blank is right when it matches closely, ignoring case and small typos', () => {
  expect(checkBlank('protons flow down their gradient', 'Protons flow down their gradient')).toBe(true);
  expect(checkBlank('protons flow down thier gradient', 'Protons flow down their gradient')).toBe(true);
  expect(checkBlank('electrons', 'Protons flow down their gradient')).toBe(false);
  expect(checkBlank('', 'cytoplasm')).toBe(false);
});

test('easier formats cap the rating; a wrong answer suggests Again', () => {
  expect(suggestFor('choice', true)).toBe(Rating.Hard);
  expect(suggestFor('blank', true)).toBe(Rating.Good);
  expect(suggestFor('choice', false)).toBe(Rating.Again);
  expect(allowedRatings('choice')).toEqual([Rating.Again, Rating.Hard]);
  expect(allowedRatings('blank')).toEqual([Rating.Again, Rating.Hard, Rating.Good]);
  expect(allowedRatings('typed')).toEqual([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);
  expect(allowedRatings('reverse')).toHaveLength(4);
});

test('the warm-up holds up to 10 cards: one matching set of 4 and true or false for the rest', async () => {
  const { buildWarmUp } = await import('@/review/formats');
  const cards = Array.from({ length: 14 }, (_, n) => card(n));
  const items = buildWarmUp(cards, 3);
  const match = items.filter((x) => x.kind === 'match');
  const tf = items.filter((x) => x.kind === 'tf');
  expect(match).toHaveLength(1);
  expect(tf).toHaveLength(6);
  const m = match[0] as Extract<typeof items[number], { kind: 'match' }>;
  expect([...m.backs].sort()).toEqual(m.pairs.map((p) => p.back).sort());
  for (const q of tf as Extract<typeof items[number], { kind: 'tf' }>[]) {
    expect(q.isTrue).toBe(q.shown === q.answer);
    expect(cards.find((c) => c.id === q.cardId)!.back).toBe(q.answer);
  }
  expect(tf.some((q) => !(q as { isTrue: boolean }).isTrue)).toBe(true);
  expect(buildWarmUp(cards, 3)).toEqual(items);
});

test('the warm-up skips matching when answers repeat, and needs 2 cards', async () => {
  const { buildWarmUp } = await import('@/review/formats');
  const same = Array.from({ length: 5 }, (_, n) => card(n, { back: 'Mitochondria' }));
  const items = buildWarmUp(same, 1);
  expect(items.every((x) => x.kind === 'tf' && x.isTrue)).toBe(true); // no wrong answer to show
  expect(buildWarmUp([card(1)], 1)).toEqual([]);
});
