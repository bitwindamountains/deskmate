import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const saveGoals = vi.fn();
vi.mock('@/app/(app)/study/deck/[deckId]/actions', () => ({ saveGoals: (...a: unknown[]) => saveGoals(...a) }));
const getEmbedder = vi.fn();
vi.mock('@/lib/embed/embed', () => ({ getEmbedder: () => getEmbedder() }));
import { Goals } from '@/app/(app)/study/deck/[deckId]/goals';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const D = '11111111-1111-4111-8111-111111111111';
const cards = [{ id: 'a', front: 'What makes ATP?', back: 'Mitochondria' }, { id: 'b', front: 'Capital of France?', back: 'Paris' }];
const LABEL = 'Paste your syllabus, learning objectives or past exam questions';

// Fake embedder: texts about cells point one way, everything else the other.
const embed = async (texts: string[]) => texts.map((t) => (/cell|ATP|Mitochondria/i.test(t) ? [1, 0] : [0, 1]));

function save(text: string) {
  render(<Goals deckId={D} goals="" cards={cards} />);
  fireEvent.change(screen.getByLabelText(LABEL), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and match cards' }));
}

test('saving matches cards on the device and reports the count', async () => {
  getEmbedder.mockResolvedValue(embed);
  saveGoals.mockResolvedValue({ ok: true, matched: 1 });
  save('Explain how cells make energy');
  expect(await screen.findByText('1 of 2 cards match your course goals.')).toBeTruthy();
  expect(saveGoals).toHaveBeenCalledWith(D, 'Explain how cells make energy', ['a']);
});

test('without the on-device model the goals still save and the matches stay', async () => {
  getEmbedder.mockResolvedValue(null);
  saveGoals.mockResolvedValue({ ok: true, matched: 4 });
  save('Explain how cells make energy');
  expect(await screen.findByText("Goals saved. Matching cards needs a model download that didn't finish; try again later.")).toBeTruthy();
  expect(saveGoals).toHaveBeenCalledWith(D, 'Explain how cells make energy', null);
});

test('clearing the goals clears every match without loading the model', async () => {
  saveGoals.mockResolvedValue({ ok: true, matched: 0 });
  save('   ');
  expect(await screen.findByText('Goals cleared.')).toBeTruthy();
  expect(saveGoals).toHaveBeenCalledWith(D, '   ', []);
  expect(getEmbedder).not.toHaveBeenCalled();
});

test('a failed save is an alert', async () => {
  getEmbedder.mockResolvedValue(embed);
  saveGoals.mockResolvedValue({ ok: false, message: "We couldn't save your goals." });
  save('Explain how cells make energy');
  expect((await screen.findByRole('alert')).textContent).toBe("We couldn't save your goals.");
});

test('every card is matched and at most 2,000 matches are sent', async () => {
  getEmbedder.mockResolvedValue(async (texts: string[]) => texts.map(() => [1, 0]));
  saveGoals.mockResolvedValue({ ok: true, matched: 2000 });
  const big = Array.from({ length: 2100 }, (_, i) => ({ id: `c${i}`, front: 'cell', back: 'x' }));
  render(<Goals deckId={D} goals="" cards={big} />);
  fireEvent.change(screen.getByLabelText(LABEL), { target: { value: 'Explain how cells make energy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and match cards' }));
  await screen.findByText('2000 of 2100 cards match your course goals.');
  expect((saveGoals.mock.calls[0][2] as string[]).length).toBe(2000);
});
