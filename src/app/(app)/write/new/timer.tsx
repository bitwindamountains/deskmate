'use client';

import { useEffect, useState } from 'react';

const plural = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'} left`;

/**
 * A4.5: a countdown shown as text. Screen readers hear it only at 5 and 1 minutes left (not every minute), and at zero.
 * It never submits or locks the essay: running out of time is information, not a penalty.
 */
export function Timer({ minutes, startedAt }: { minutes: number; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((startedAt + minutes * 60_000 - now) / 60_000));
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {left > 0 ? <p className="font-bold tabular-nums">{plural(left)}</p>
        : <p role="alert" className="font-bold">Time&apos;s up. Finish your sentence and get feedback.</p>}
      <p role="status" aria-label="Timer" className="sr-only">{left === 5 || left === 1 ? plural(left) : ''}</p>
    </div>
  );
}
