'use client';

import { useEffect } from 'react';
import type { ItemRow } from '@/lib/essay/analyze';
import { FeedbackCard, isOpen, type CardApi } from './feedback-card';

/** One Top-3 item at a time (A-S4). current is null once every item is addressed. Escape exits. */
export function FocusMode({ items, current, api, onPick, onExit }:
  { items: ItemRow[]; current: string | null; api: CardApi; onPick: (id: string | null) => void; onExit: () => void }) {
  const it = items.find((i) => i.id === current);
  const done = items.filter((i) => !isOpen(api.status(i))).length;
  // The next still-open item after `from`, wrapping round; null when none is left.
  const next = (from: string) => {
    const k = items.findIndex((i) => i.id === from);
    for (let d = 1; d < items.length; d++) {
      const c = items[(k + d) % items.length];
      if (isOpen(api.status(c))) return c.id;
    }
    return null;
  };
  const advanceAfter = <A extends unknown[]>(fn: (it: ItemRow, ...a: A) => Promise<boolean>) =>
    async (x: ItemRow, ...a: A) => { const ok = await fn(x, ...a); if (ok) onPick(next(x.id)); return ok; };
  // A disagreement stays on its card so the student can read the coach's reply.
  const focusApi: CardApi = { ...api, gotIt: advanceAfter(api.gotIt) };
  const skipTo = it ? next(it.id) : null;

  useEffect(() => { document.getElementById(current ? `card-${current}` : 'focus-done')?.focus(); }, [current]);

  return (
    <section aria-labelledby="focus-h" className="space-y-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onExit(); } }}>
      <h2 id="focus-h" className="hand text-2xl">Focus mode</h2>
      <p role="status" className="font-bold">{done} of {items.length} priorities addressed</p>
      {it ? (
        <FeedbackCard item={it} api={focusApi}>
          {skipTo && <button type="button" className="btn" onClick={() => onPick(skipTo)}>Skip</button>}
        </FeedbackCard>
      ) : (
        <p id="focus-done" tabIndex={-1} className="inlay p-4 font-bold">
          All {items.length} priorities addressed. Nice work.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={onExit}>Exit focus mode</button>
        <p className="text-sm text-ink-muted">Esc also exits.</p>
      </div>
    </section>
  );
}
