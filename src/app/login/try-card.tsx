'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGap, isRight, spacingIfRight, TRY_CARDS } from '@/lib/try-card';

/** A card to answer before signing in. Checked on the device; nothing is sent or saved. */
export function TryCard() {
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const card = TRY_CARDS[i];
  const moved = useRef(false);
  // The card re-mounts (and slides in) for each new question, so focus moves to its field after that.
  useEffect(() => { if (moved.current) input.current?.focus(); }, [i]);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) setResult(isRight(answer, card.answers) ? 'right' : 'wrong');
  };
  const next = () => {
    setI((i + 1) % TRY_CARDS.length);
    setAnswer('');
    setResult(null);
    moved.current = true;
  };
  const gaps = result === 'right' ? spacingIfRight(new Date()).map(formatGap) : [];

  return (
    <section aria-labelledby="try-label" className="inlay card-in p-5 shadow-[5px_5px_0_-1px_var(--surface),5px_5px_0_0_var(--line)]" key={i}>
      <p id="try-label" className="-mx-5 -mt-1 mb-3 border-b-2 border-accent px-5 pb-2 text-sm text-ink-muted">Try one · {card.deck}</p>
      <form onSubmit={check} className="space-y-3">
        <p className="text-lg font-bold text-balance">{card.front}</p>
        <div>
          <label htmlFor="try-answer" className="mb-1 block">Your answer</label>
          <div className="flex gap-2">
            <input id="try-answer" ref={input} value={answer} autoComplete="off" className="field min-w-0 flex-1"
              onChange={(e) => { setAnswer(e.target.value); setResult(null); }} />
            <button type="submit" className="btn" disabled={!answer.trim()}>Check</button>
          </div>
        </div>
      </form>
      <div role="status" className="mt-3 space-y-2">
        {result === 'right' && (<>
          <p><span className="ink-draw font-bold">Right.</span></p>
          <p className="text-pretty">
            Get it right each time and you&apos;d see it again in <mark className="rounded-sm bg-[var(--highlight)] px-0.5 text-ink">{gaps[0]}</mark>, then {gaps.slice(1, -1).join(', then ')}, then{' '}
            {gaps.at(-1)}: each time just before you&apos;d forget it.
          </p>
        </>)}
        {result === 'wrong' && (<>
          <p><span className="ink-draw font-bold">Not quite.</span> The answer is <strong>{card.answers[0]}</strong>.</p>
          <p className="text-pretty">A miss comes back in a minute, so you practise it while it&apos;s fresh.</p>
        </>)}
      </div>
      {result && <button type="button" className="mt-3 min-h-11 underline" onClick={next}>Try another</button>}
    </section>
  );
}
