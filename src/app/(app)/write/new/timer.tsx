'use client';

import { useEffect, useRef, useState } from 'react';

const plural = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'} left`;
const minutesLeft = (minutes: number, startedAt: number, now: number) => Math.max(0, Math.ceil((startedAt + minutes * 60_000 - now) / 60_000));

/** Whole minutes from start to stop (or now), rounded up and capped at the limit plus 30 minutes of grace. */
export function minutesUsed(minutes: number, startedAt: number, stoppedAt: number | null, now = Date.now()): number {
  return Math.min(minutes + 30, Math.max(0, Math.ceil(((stoppedAt ?? now) - startedAt) / 60_000)));
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * A4.5: a countdown shown as text. Screen readers hear it only at 5 and 1 minutes left (not every minute), and at zero.
 * It never submits or locks the essay: running out of time is information, not a penalty.
 */
export function Timer({ minutes, startedAt, stoppedAt, onStop }: { minutes: number; startedAt: number; stoppedAt: number | null; onStop: () => void }) {
  const now = useNow();
  const stoppedRef = useRef<HTMLParagraphElement>(null);
  // The Stop button disappears, so focus moves to the result instead of dropping to the page.
  useEffect(() => { if (stoppedAt !== null) stoppedRef.current?.focus(); }, [stoppedAt]);
  if (stoppedAt !== null) {
    const used = Math.max(1, minutesUsed(minutes, startedAt, stoppedAt)); // the same capped value that gets saved
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <p ref={stoppedRef} tabIndex={-1} role="status" className="font-bold outline-none">{`Stopped at ${used} ${used === 1 ? 'minute' : 'minutes'}`}</p>
      </div>
    );
  }
  const left = minutesLeft(minutes, startedAt, now);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
      {left > 0 ? <p className="font-bold tabular-nums">{plural(left)}</p>
        : <p role="alert" className="font-bold">Time&apos;s up. Finish your sentence and get feedback.</p>}
      <button type="button" className="btn" onClick={onStop}>Stop the timer</button>
      <p role="status" aria-label="Timer" className="sr-only">{left === 5 || left === 1 ? plural(left) : ''}</p>
    </div>
  );
}

/** The same countdown, quietly, next to the submit button: on a phone the main timer scrolls out of sight while writing. */
export function TimeLeft({ minutes, startedAt }: { minutes: number; startedAt: number }) {
  const left = minutesLeft(minutes, startedAt, useNow());
  return <span className="text-sm font-bold tabular-nums text-ink-muted">{left > 0 ? plural(left) : "Time's up"}</span>;
}
