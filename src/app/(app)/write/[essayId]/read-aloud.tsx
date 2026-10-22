'use client';

import { useEffect, useState } from 'react';
import { splitSentences } from '@/lib/essay/sentences';

export type Reading = { para: number; start: number; end: number };

/**
 * A3.11: reads the essay with the browser's own speech, one utterance per sentence, so the sentence being read can be
 * highlighted. Hidden where speechSynthesis is missing. No server, no cost.
 */
export function ReadAloud({ paragraphs, onSentence }: { paragraphs: string[]; onSentence: (r: Reading | null) => void }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');

  useEffect(() => {
    setSupported(typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined');
    return () => { window.speechSynthesis?.resume(); window.speechSynthesis?.cancel(); };
  }, []);

  // Chrome keeps its paused flag through cancel(), so later speech would queue silently; resume first.
  function stop() {
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    setState('idle');
    onSentence(null);
  }

  function play() {
    const synth = window.speechSynthesis;
    if (state === 'paused') { synth.resume(); setState('playing'); return; }
    if (state === 'playing') { synth.pause(); setState('paused'); return; }
    synth.resume();
    synth.cancel();
    const rate = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.9 : 1;
    const parts = paragraphs.flatMap((text, para) => splitSentences(text).map((s) => ({ para, ...s, text: text.slice(s.start, s.end) })));
    parts.forEach((p, k) => {
      const u = new SpeechSynthesisUtterance(p.text);
      u.rate = rate;
      u.lang = 'en';
      u.onstart = () => onSentence({ para: p.para, start: p.start, end: p.end });
      u.onerror = () => { setState('idle'); onSentence(null); };
      if (k === parts.length - 1) u.onend = () => { setState('idle'); onSentence(null); };
      synth.speak(u);
    });
    setState(parts.length ? 'playing' : 'idle');
  }

  if (!supported) return null;
  return (
    <div role="group" aria-label="Read aloud" className="flex flex-wrap items-center gap-2">
      {/* The label names the action the button takes now, so it changes rather than using aria-pressed. */}
      <button type="button" className="btn" onClick={play}>{state === 'playing' ? 'Pause' : 'Play'}</button>
      <button type="button" className="btn" onClick={stop} disabled={state === 'idle'}>Stop</button>
      <span role="status" className="text-sm text-ink-muted empty:hidden">{state === 'playing' ? 'Reading…' : state === 'paused' ? 'Paused' : ''}</span>
    </div>
  );
}
