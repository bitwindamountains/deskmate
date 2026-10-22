import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ReadAloud } from '@/app/(app)/write/[essayId]/read-aloud';

class Utterance { text: string; rate = 1; lang = ''; onstart?: () => void; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } }
let queue: Utterance[] = [];
const synth = { speak: vi.fn((u: Utterance) => queue.push(u)), cancel: vi.fn(() => { queue = []; }), pause: vi.fn(), resume: vi.fn() };
const PARAS = ['First sentence here. Second one here.', 'Third sentence.'];

beforeEach(() => {
  queue = [];
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

test('Play queues one utterance per sentence; onstart highlights that sentence', () => {
  const onSentence = vi.fn();
  render(<ReadAloud paragraphs={PARAS} onSentence={onSentence} />);
  const group = screen.getByRole('group', { name: 'Read aloud' });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(queue.map((u) => u.text)).toEqual(['First sentence here.', 'Second one here.', 'Third sentence.']);
  expect(queue[0].rate).toBe(1);
  act(() => queue[1].onstart!());
  expect(onSentence).toHaveBeenLastCalledWith({ para: 0, start: 21, end: 37 });
  expect(group.textContent).toContain('Pause');
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(synth.pause).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(synth.resume).toHaveBeenCalled();
  act(() => { queue[2].onstart!(); queue[2].onend!(); });
  expect(onSentence).toHaveBeenLastCalledWith(null); // finished: highlight cleared
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
});

test('Stop cancels speech and clears the highlight', () => {
  const onSentence = vi.fn();
  render(<ReadAloud paragraphs={PARAS} onSentence={onSentence} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  act(() => queue[0].onstart!());
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(synth.cancel).toHaveBeenCalled();
  expect(onSentence).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  expect(screen.queryByText('Reading…')).toBeNull();
});

test('controls are hidden when speechSynthesis is missing', () => {
  vi.stubGlobal('speechSynthesis', undefined);
  render(<ReadAloud paragraphs={PARAS} onSentence={vi.fn()} />);
  expect(screen.queryByRole('group', { name: 'Read aloud' })).toBeNull();
});

test('reduced motion slows the rate to 0.9', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
  render(<ReadAloud paragraphs={PARAS} onSentence={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(queue.every((u) => u.rate === 0.9)).toBe(true);
});

test('Stop while paused resumes the engine before cancelling, so the next Play is heard', () => {
  render(<ReadAloud paragraphs={PARAS} onSentence={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  synth.resume.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(synth.resume).toHaveBeenCalled();
  expect(synth.resume.mock.invocationCallOrder[0]).toBeLessThan(synth.cancel.mock.invocationCallOrder.at(-1)!);
});
