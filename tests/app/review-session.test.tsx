import { writeHref } from '@/growth/prompts';
import 'fake-indexeddb/auto';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReviewCard } from '@/app/(app)/study/review/session';
import { db } from '@/review/store';

// fake IndexedDB writes are slow when the whole suite runs in parallel; the 1 s default flakes
configure({ asyncUtilTimeout: 5000 });
// a whole session test makes several 5 s-bounded waits; the default 5 s test budget can't hold them under load
vi.setConfig({ testTimeout: 20_000 });

const getEmbedder = vi.fn();
vi.mock('@/lib/embed/embed', () => ({ getEmbedder: () => getEmbedder() }));
const syncOutbox = vi.fn();
vi.mock('@/review/sync', () => ({ syncOutbox: (...a: unknown[]) => syncOutbox(...a) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: vi.fn() }) }));

import { ReviewSession } from '@/app/(app)/study/review/session';

const card = (id: string, over: Partial<ReviewCard> = {}): ReviewCard => ({
  id, deckId: 'd', type: 'basic', importance: 2, state: null, front: `Front ${id}`, back: 'electron transport chain', keyPoints: [], concept: 'c',
  sourceQuote: 'The electron transport chain makes most of the ATP.', ...over,
});
const why = card('w', { type: 'why', front: 'Why does ATP synthase spin?', back: 'Protons flow down their gradient', keyPoints: ['proton gradient'] });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const llm = { score: 0.8, hit: ['proton gradient'], missed: [], misconception: null, feedback: 'You named the gradient.', suggested_rating: 'good' };

const fetchMock = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  getEmbedder.mockResolvedValue(null);
  syncOutbox.mockResolvedValue({ sent: 0, regraded: 0, failed: 0 });
  // Delete and reopen rather than clear: a previous test's in-flight write (cards reuse ids 'a' and 'b') must abort,
  // not land after the clear and hand this test a stale local state.
  await db.delete();
  await db.open();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const start = async (cards: ReviewCard[]) => {
  render(<ReviewSession cards={cards} minutes={20} newIntroducedToday={0} examDates={{}} />);
  return (await screen.findByLabelText('Your answer')) as HTMLTextAreaElement;
};
const answer = async (field: HTMLTextAreaElement, text: string) => {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};
// a slow answer: Easy needs under 10 s, so a typo answered after 12 s is Good
const after12s = () => { const t = Date.now() + 12000; vi.spyOn(Date, 'now').mockReturnValue(t); };
const rating = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const outbox = () => db.outbox.toArray();

test('typo answer shows Good pre-selected and Suggested label, no grade request', async () => {
  const field = await start([card('a'), card('b')]);
  expect(screen.getByText('Card 1 of 2')).toBeTruthy();
  after12s();
  await answer(field, 'electron transport chian');
  await waitFor(() => expect(rating('Good').textContent).toContain('Suggested'));
  expect(rating('Good').getAttribute('aria-pressed')).toBe('true');
  expect(rating('Hard').textContent).not.toContain('Suggested');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText('electron transport chian')).toBeTruthy();
});

test('why card shows Checking your answer then the LLM feedback', async () => {
  let release!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((r) => { release = r; }));
  const field = await start([why]);
  await answer(field, 'protons move through it');
  expect(await screen.findByText('Checking your answer…')).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'w', answer: 'protons move through it' });
  await act(async () => release(json(200, { result: llm, cached: false })));
  expect(await screen.findByText('You named the gradient.')).toBeTruthy();
  expect(screen.getByText('✓ Got this: proton gradient')).toBeTruthy();
  expect(rating('Good').textContent).toContain('Suggested');
});

test('grade 503 shows self-grade prompt and queues a regrade', async () => {
  fetchMock.mockResolvedValueOnce(json(503, { error: 'busy', message: 'x' }));
  const field = await start([why]);
  await answer(field, 'no idea really');
  expect(await screen.findByText("Couldn't check this one right now. How did you do?")).toBeTruthy();
  expect(screen.queryByText(/Suggested/)).toBeNull();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  const [row] = await outbox();
  expect(row).toMatchObject({ needsRegrade: 1, review: { grade_source: 'self', final_rating: 2, suggested_rating: null, answer_text: 'no idea really' } });
});

test('grade 429 says checking is used up for today and keeps the student rating without a regrade', async () => {
  fetchMock.mockResolvedValueOnce(json(429, { error: 'grade_limit', message: 'x' }));
  const field = await start([why]);
  await answer(field, 'no idea really');
  expect(await screen.findByText(/^You've had a lot of answers checked today\. Rate this one yourself; checking is back in (under an hour|about \d+ hours?)\.$/)).toBeTruthy();
  expect(screen.queryByText("Couldn't check this one right now. How did you do?")).toBeNull();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  const [row] = await outbox();
  expect(row).toMatchObject({ needsRegrade: 0, review: { grade_source: 'self', final_rating: 2, suggested_rating: null } });
});

test('pressing 1 overrides the suggestion to Again', async () => {
  const field = await start([card('a'), card('b')]);
  after12s();
  await answer(field, 'electron transport chian');
  await waitFor(() => expect(rating('Good').textContent).toContain('Suggested'));
  fireEvent.keyDown(window, { key: '1' });
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  const [row] = await outbox();
  expect(row.review).toMatchObject({ final_rating: 1, suggested_rating: 3, grade_source: 'fuzzy', card_id: 'a' });
  expect(row.needsRegrade).toBe(0);
  expect((await db.states.get('a'))?.reps).toBe(1);
});

test('Show answer flips the card and the student rates it', async () => {
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('electron transport chain')).toBeTruthy();
  fireEvent.click(rating('Easy'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  expect((await outbox())[0].review).toMatchObject({ grade_source: 'self', final_rating: 4, answer_text: null, suggested_rating: null });
});

test('summary shows count, accuracy, and next review', async () => {
  const field = await start([card('a'), card('b')]);
  await answer(field, 'electron transport chain');
  await waitFor(() => rating('Easy'));
  fireEvent.keyDown(window, { key: '3' });
  await answer(await screen.findByLabelText('Your answer') as HTMLTextAreaElement, 'no clue');
  await waitFor(() => rating('Again'));
  fireEvent.keyDown(window, { key: '1' });
  expect(await screen.findByRole('heading', { name: 'Session done' })).toBeTruthy();
  expect(screen.getByText('2 cards reviewed')).toBeTruthy();
  expect(screen.getByText('Accuracy: 50%')).toBeTruthy();
  expect(screen.getByText(/^Next review: today, about 2 cards$/)).toBeTruthy();
  await waitFor(() => expect(syncOutbox).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Do more' })).toBeTruthy();
});

test('a miss the student rates Good still counts as a miss in accuracy and concepts', async () => {
  fetchMock.mockResolvedValue(json(200, { result: { ...llm, score: 0, hit: [], suggested_rating: 'again' }, cached: false }));
  const field = await start([card('a', { concept: 'Glycolysis' })]);
  await answer(field, 'no clue');
  await screen.findByText(/Suggested/);
  await waitFor(() => rating('Again'));
  fireEvent.keyDown(window, { key: '3' });
  expect(await screen.findByRole('heading', { name: 'Session done' })).toBeTruthy();
  expect(screen.getByText('Accuracy: 0%')).toBeTruthy();
  expect(screen.queryByText(/Got stronger/)).toBeNull();
  expect(screen.getByText('Needs another look: Glycolysis')).toBeTruthy();
});

test('keyboard only: Enter checks, digits rate, focus returns to the answer field', async () => {
  const field = await start([card('a'), card('b')]);
  await waitFor(() => expect(document.activeElement).toBe(field)); // focus is set by an effect after the field renders
  fireEvent.change(field, { target: { value: 'electron transport chain' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() => expect(rating('Easy').textContent).toContain('Suggested'));
  fireEvent.keyDown(window, { key: '3' });
  expect(await screen.findByText('Card 2 of 2')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Your answer')));
});

test('no cards due shows a calm empty state', async () => {
  render(<ReviewSession cards={[]} minutes={20} newIntroducedToday={0} examDates={{}} />);
  expect(await screen.findByText('Nothing to review right now.')).toBeTruthy();
});

const sure = (name: 'Guessing' | 'Unsure' | 'Confident') => fireEvent.click(screen.getByRole('radio', { name }));

test('choosing Confident then rating Again shows the note with the source quote', async () => {
  await start([card('a'), card('b')]);
  sure('Confident');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  expect(await screen.findByText("You felt sure about “Front a”, so it's worth a second look.")).toBeTruthy();
  expect(screen.getByText('From your notes: The electron transport chain makes most of the ATP.')).toBeTruthy();
  expect(screen.getByText('Card 2 of 2')).toBeTruthy();
  await waitFor(async () => expect((await outbox())[0].review).toMatchObject({ confidence: 3, final_rating: 1 }));
});

test('confidence is optional: answering without it still saves a review without the field', async () => {
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Good'));
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
  expect('confidence' in (await outbox())[0].review).toBe(false);
});

test('G, U, C keys set confidence only while the answer field is not focused', async () => {
  const field = await start([card('a')]);
  field.blur();
  fireEvent.keyDown(window, { key: 'c' });
  expect((screen.getByRole('radio', { name: 'Confident' }) as HTMLInputElement).checked).toBe(true);
  field.focus();
  fireEvent.keyDown(field, { key: 'g' });
  expect((screen.getByRole('radio', { name: 'Guessing' }) as HTMLInputElement).checked).toBe(false);
});

test('View source shows the card source quote after checking', async () => {
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'View source' }));
  expect(screen.getByText('The electron transport chain makes most of the ATP.')).toBeTruthy();
});

const leech = (id: string): ReviewCard => card(id, {
  state: { card_id: id, due: '2026-01-01T00:00:00.000Z', stability: 1, difficulty: 8, scheduled_days: 0, learning_steps: 0,
    reps: 9, lapses: 5, state: 3, last_review: '2025-12-31T00:00:00.000Z' },
});
const helpBody = { help: { explanation: 'Think of it as the cell\'s power line.', mnemonic: 'ETC = Energy Through Chain.', analogy: 'Like a bucket brigade.' },
  added: 2, dropped: 0, cached: false };

test('Again on a leech shows the slipping prompt; Get help shows explanation, mnemonic and the new-cards link', async () => {
  fetchMock.mockResolvedValueOnce(json(200, helpBody));
  await start([leech('a'), card('b')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  expect(await screen.findByText('“Front a” keeps slipping. Want a different way in?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
  expect(await screen.findByText('ETC = Energy Through Chain.')).toBeTruthy();
  expect(screen.getByText("Think of it as the cell's power line.")).toBeTruthy();
  expect(screen.getByText('Like a bucket brigade.')).toBeTruthy();
  expect(screen.getByRole('link', { name: '2 new cards added to your deck for sorting' }).getAttribute('href')).toBe('/study/deck/d');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'a' });
});

test('Make a mnemonic asks for help on the current card', async () => {
  fetchMock.mockResolvedValueOnce(json(200, { ...helpBody, added: 0 }));
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Make a mnemonic' }));
  expect(await screen.findByText('ETC = Energy Through Chain.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /new cards added/ })).toBeNull();
});

test('a help limit or failure shows the route message', async () => {
  fetchMock.mockResolvedValueOnce(json(429, { error: 'help_limit', message: "You've asked for a lot of help today. More unlocks in about 7 hours." }));
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Make a mnemonic' }));
  expect(await screen.findByText("You've asked for a lot of help today. More unlocks in about 7 hours.")).toBeTruthy();
});

test('Mix topics takes one card from each concept in turn and is remembered', async () => {
  localStorage.removeItem('scholar-mix-topics');
  await start([card('a', { concept: 'x' }), card('b', { concept: 'x' }), card('c', { concept: 'y' })]);
  fireEvent.click(screen.getByRole('switch', { name: 'Mix topics' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Good'));
  expect(await screen.findByRole('heading', { name: 'Front c' })).toBeTruthy();
  expect(localStorage.getItem('scholar-mix-topics')).toBe('1');
});

test('summary lists concepts that got stronger and that need another look', async () => {
  await start([card('a', { concept: 'Glycolysis' }), card('b', { concept: 'Krebs' })]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Good'));
  fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  expect(await screen.findByText('Got stronger: Glycolysis')).toBeTruthy();
  expect(screen.getByText('Needs another look: Krebs')).toBeTruthy();
});

test('switching Mix topics mid-card keeps the card on screen (its answer is rated on that card)', async () => {
  localStorage.removeItem('scholar-mix-topics');
  await start([card('a', { concept: 'x' }), card('b', { concept: 'x' }), card('c', { concept: 'y' })]);
  fireEvent.click(screen.getByRole('switch', { name: 'Mix topics' })); // order a, c, b
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Good'));
  expect(await screen.findByRole('heading', { name: 'Front c' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Mix topics' })); // off: the rest goes back to due order
  expect(screen.getByRole('heading', { name: 'Front c' })).toBeTruthy();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect((await outbox()).map((r) => r.review.card_id).sort()).toEqual(['a', 'c']));
});

test('a why card rated Again shows Explain it in writing with the prefilled link; a basic card does not', async () => {
  await start([why, card('b'), card('c')]);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  const link = await screen.findByRole('link', { name: 'Explain it in writing' });
  expect(link.getAttribute('href')).toBe(writeHref('Why does ATP synthase spin?', 'Explain in one paragraph (at least 50 words): Why does ATP synthase spin?'));
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  await waitFor(() => expect(screen.getByText('Card 3 of 3')).toBeTruthy());
  expect(screen.queryByRole('link', { name: 'Explain it in writing' })).toBeNull();
});

test('a practice card sure-but-wrong note says Example:', async () => {
  await start([card('a', { sourceQuote: 'It rained, we stayed in.', quoteIsExample: true }), card('b')]);
  sure('Confident');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(rating('Again'));
  expect(await screen.findByText('Example: It rained, we stayed in.')).toBeTruthy();
  expect(screen.queryByText(/From your notes/)).toBeNull();
});

test('Ask it another way shows a reworded question; the original is one tap away (B3.1)', async () => {
  fetchMock.mockResolvedValueOnce(json(200, { question: 'Reworded question?', cached: false }));
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Ask it another way' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Reworded question?' })).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ cardId: 'a' });
  fireEvent.click(screen.getByRole('button', { name: 'Show the original' }));
  expect(screen.queryByRole('heading', { level: 2, name: 'Reworded question?' })).toBeNull();
});

test('a refused rewording explains why and keeps the card as it is', async () => {
  fetchMock.mockResolvedValueOnce(json(422, { error: 'unusable', message: "We couldn't find a fair way to reword this one. Try the card as it is." }));
  await start([card('a')]);
  fireEvent.click(screen.getByRole('button', { name: 'Ask it another way' }));
  expect(await screen.findByText("We couldn't find a fair way to reword this one. Try the card as it is.")).toBeTruthy();
});

// Review formats (plan 2026-10-25-review-formats.md)
const cell = (id: string, back: string, over: Partial<ReviewCard> = {}) => card(id, { front: `Where is ${id}?`, back, concept: 'cell', ...over });
const choiceDeck = [cell('m', 'Mitochondria'), cell('n', 'Nucleus'), cell('r', 'Ribosome'), cell('g', 'Golgi body')];
const startChoice = async (cards: ReviewCard[]) => {
  render(<ReviewSession cards={cards} minutes={20} newIntroducedToday={0} examDates={{}} />);
  await screen.findAllByRole('radio', { name: /Mitochondria|Nucleus|Ribosome|Golgi body/ });
};
const currentBack = () => {
  const front = screen.getByRole('heading', { level: 2 }).textContent!;
  return choiceDeck.find((c) => c.front === front)!.back;
};

test('a new card is multiple choice: right suggests Hard, hides Good and Easy, and never calls the grader', async () => {
  await startChoice(choiceDeck);
  expect(screen.getByText(/Pick from the options first/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: currentBack() }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText('Right.')).toBeTruthy();
  expect(rating('Hard').textContent).toContain('Suggested');
  expect(screen.queryByRole('button', { name: /^Good/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Easy/ })).toBeNull();
  fireEvent.keyDown(window, { key: '3' }); // Good is above the cap: ignored
  expect(screen.getByText('Right.')).toBeTruthy();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect((await outbox()).map((r) => [r.review.grade_source, r.review.final_rating])).toEqual([['choice', 2]]));
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a wrong option suggests Again', async () => {
  await startChoice(choiceDeck);
  const wrong = choiceDeck.map((c) => c.back).find((b) => b !== currentBack())!;
  fireEvent.click(screen.getByRole('radio', { name: wrong }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText('Not quite.')).toBeTruthy();
  expect(rating('Again').textContent).toContain('Suggested');
});

test('Type it instead switches the card to typed recall', async () => {
  await startChoice(choiceDeck);
  fireEvent.click(screen.getByRole('button', { name: 'Type it instead' }));
  expect(await screen.findByLabelText('Your answer')).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Nucleus' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Show answer' })).toBeTruthy();
});

test('typing after seeing the options keeps the multiple-choice cap and never calls the grader', async () => {
  await startChoice(choiceDeck);
  const back = currentBack();
  fireEvent.click(screen.getByRole('button', { name: 'Type it instead' }));
  await answer((await screen.findByLabelText('Your answer')) as HTMLTextAreaElement, back);
  await waitFor(() => expect(rating('Hard').textContent).toContain('Suggested'));
  expect(screen.queryByRole('button', { name: /^Easy/ })).toBeNull();
  fireEvent.click(rating('Hard'));
  await waitFor(async () => expect((await outbox()).map((r) => [r.review.grade_source, r.review.final_rating])).toEqual([['choice', 2]]));
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a learning card with a key point in its answer is a blank: right suggests Good and hides Easy', async () => {
  const learning = { card_id: 'k', due: '2026-01-01T00:00:00.000Z', stability: 1, difficulty: 5, scheduled_days: 0, learning_steps: 1,
    reps: 1, lapses: 0, state: 1, last_review: '2026-01-01T00:00:00.000Z' };
  render(<ReviewSession cards={[card('k', { back: 'Glycolysis happens in the cytoplasm', keyPoints: ['cytoplasm'], state: learning })]}
    minutes={20} newIntroducedToday={0} examDates={{}} />);
  const input = await screen.findByLabelText('Fill in the blank');
  expect(screen.getByText(/Glycolysis happens in the/)).toBeTruthy();
  fireEvent.change(input, { target: { value: 'Cytoplasm' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText('Right.')).toBeTruthy();
  expect(rating('Good').textContent).toContain('Suggested');
  expect(screen.queryByRole('button', { name: /^Easy/ })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a strong basic card on every third review is reversed and self-rated with all four ratings', async () => {
  const strong = { card_id: 'v', due: '2026-01-01T00:00:00.000Z', stability: 30, difficulty: 5, scheduled_days: 30, learning_steps: 0,
    reps: 5, lapses: 0, state: 2, last_review: '2025-12-01T00:00:00.000Z' };
  render(<ReviewSession cards={[card('v', { front: 'Where does glycolysis happen?', back: 'In the cytoplasm', state: strong })]}
    minutes={20} newIntroducedToday={0} examDates={{}} />);
  expect(await screen.findByRole('heading', { name: 'In the cytoplasm' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show the question' }));
  expect(await screen.findByText('Where does glycolysis happen?')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Question' })).toBeTruthy();
  fireEvent.click(rating('Easy'));
  await waitFor(async () => expect((await outbox()).map((r) => [r.review.grade_source, r.review.final_rating])).toEqual([['reverse', 4]]));
  expect(fetchMock).not.toHaveBeenCalled();
});
