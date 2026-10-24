'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_MS = 60_000; // a minute is plenty for one answer

type State = 'idle' | 'recording' | 'working';

/**
 * B3.6: speak an answer instead of typing it. Recording and speech-to-text both happen on the device; the text goes to
 * onText for the student to check. `transcribe` is injectable for tests; the default loads the on-device model lazily.
 */
export function MicButton({ onText, transcribe }: { onText: (text: string) => void; transcribe?: (audio: Blob) => Promise<string> }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checked after mount, so the server and the first browser render agree.
  useEffect(() => { setSupported(typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && !!navigator.mediaDevices?.getUserMedia); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); recorder.current?.stop(); }, []);

  async function start() {
    setError('');
    setDone(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError('Scholar needs permission to use your microphone. You can type your answer instead.');
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      if (timer.current) clearTimeout(timer.current);
      stream.getTracks().forEach((t) => t.stop()); // release the microphone straight away
      recorder.current = null;
      setState('working');
      try {
        const run = transcribe ?? (await import('@/lib/speech/transcribe')).transcribeOnDevice;
        const text = await run(new Blob(chunks));
        if (text) { onText(text); setDone(true); } else setError("We didn't catch any words. Try again a little closer to the microphone.");
      } catch {
        setError("Voice input isn't available on this device. You can type your answer instead.");
      }
      setState('idle');
    };
    rec.start();
    setState('recording');
    timer.current = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_MS);
  }

  if (!supported) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {state === 'recording'
        ? <button type="button" className="btn" onClick={() => recorder.current?.stop()}>Stop recording</button>
        : <button type="button" className="btn" disabled={state === 'working'} onClick={() => void start()}>
            {state === 'working' ? 'Turning speech into text…' : 'Speak your answer'}
          </button>}
      <p role="status" className="text-sm text-ink-muted empty:hidden">{done && 'Turned into text on this device. Check it before you submit.'}</p>
      {error && <p role="alert" className="error text-sm">{error}</p>}
    </div>
  );
}
