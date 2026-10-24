import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FeynmanForm } from '@/app/(app)/study/feynman/feynman-form';

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
const DECK = '00000000-0000-4000-8000-000000000001';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const words = (n: number) => Array.from({ length: n }, () => 'cells').join(' ');

test('a too-short explanation is refused before sending', () => {
  render(<FeynmanForm deckId={DECK} concept="glycolysis" label="Glycolysis" />);
  fireEvent.change(screen.getByLabelText('Your explanation'), { target: { value: words(5) } });
  fireEvent.click(screen.getByRole('button', { name: 'Check my explanation' }));
  expect(screen.getByRole('alert').textContent).toBe('Explain it in 20 to 600 words.');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('feedback lists what was covered and missed, any misconception, and cards added for later (B3.7)', async () => {
  fetchMock.mockResolvedValueOnce(json(200, { feedback: { covered: ['happens in the cytoplasm'], missed: ['makes two pyruvate'],
    misconception: 'Glycolysis does not need oxygen.', added: 1, dropped: 0 } }));
  render(<FeynmanForm deckId={DECK} concept="glycolysis" label="Glycolysis" />);
  fireEvent.change(screen.getByLabelText('Your explanation'), { target: { value: words(25) } });
  fireEvent.click(screen.getByRole('button', { name: 'Check my explanation' }));
  expect(await screen.findByText('happens in the cytoplasm')).toBeTruthy();
  expect(screen.getByText('makes two pyruvate')).toBeTruthy();
  expect(screen.getByText('Glycolysis does not need oxygen.')).toBeTruthy();
  expect(screen.getByRole('link', { name: '1 new card waits in your deck' }).getAttribute('href')).toBe(`/study/deck/${DECK}`);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ deckId: DECK, concept: 'glycolysis', explanation: words(25) });
});

test('a refused request shows its message', async () => {
  fetchMock.mockResolvedValueOnce(json(429, { error: 'help_limit', message: "You've asked for a lot of help today." }));
  render(<FeynmanForm deckId={DECK} concept="glycolysis" label="Glycolysis" />);
  fireEvent.change(screen.getByLabelText('Your explanation'), { target: { value: words(25) } });
  fireEvent.click(screen.getByRole('button', { name: 'Check my explanation' }));
  expect((await screen.findByRole('alert')).textContent).toBe("You've asked for a lot of help today.");
});
