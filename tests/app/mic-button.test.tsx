import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MicButton } from '@/components/mic-button';

class FakeRecorder {
  static last: FakeRecorder;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';
  constructor() { FakeRecorder.last = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['a']) }); this.onstop?.(); }
}
const stop = vi.fn();
beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

test('record, stop, and the words land in the answer through onText; the microphone is released (B3.6)', async () => {
  const onText = vi.fn();
  render(<MicButton onText={onText} transcribe={async () => 'the mitochondria'} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak your answer' }));
  await screen.findByRole('button', { name: 'Stop recording' });
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  await waitFor(() => expect(onText).toHaveBeenCalledWith('the mitochondria'));
  expect(stop).toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toBe('Turned into text on this device. Check it before you submit.');
});

test('a refused microphone or a model that cannot load says so; nothing is sent anywhere', async () => {
  (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  render(<MicButton onText={vi.fn()} transcribe={async () => { throw new Error('no model'); }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak your answer' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Scholar needs permission to use your microphone. You can type your answer instead.');
  fireEvent.click(screen.getByRole('button', { name: 'Speak your answer' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
  expect((await screen.findByRole('alert')).textContent).toBe("Voice input isn't available on this device. You can type your answer instead.");
});

test('a recording cut short by the card moving on never reaches onText, and the microphone is released', async () => {
  const onText = vi.fn();
  const transcribe = vi.fn(async () => 'old answer');
  const { unmount } = render(<MicButton onText={onText} transcribe={transcribe} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak your answer' }));
  await screen.findByRole('button', { name: 'Stop recording' });
  unmount();
  await new Promise((r) => setTimeout(r, 0));
  expect(stop).toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
  expect(onText).not.toHaveBeenCalled();
});

test('without recording support the button is not offered', () => {
  vi.stubGlobal('MediaRecorder', undefined);
  render(<MicButton onText={vi.fn()} transcribe={async () => ''} />);
  expect(screen.queryByRole('button', { name: 'Speak your answer' })).toBeNull();
});
