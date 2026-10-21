'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Help = { explanation: string; mnemonic: string; analogy: string };
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; help: Help; added: number };
const BUSY = 'Help is busy right now. Try again in a minute.';

/** Asks /api/cards/help once when shown (the route caches per card, so reopening is free). */
export function CardHelpPanel({ cardId, deckId }: { cardId: string; deckId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/cards/help', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId }) });
        const body = await res.json().catch(() => null);
        if (!live) return;
        if (!res.ok || !body?.help) setState({ kind: 'error', message: typeof body?.message === 'string' ? body.message : BUSY });
        else setState({ kind: 'ok', help: body.help as Help, added: Number(body.added) || 0 });
      } catch {
        if (live) setState({ kind: 'error', message: BUSY });
      }
    })();
    return () => { live = false; };
  }, [cardId]);

  return (
    <div role="status" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {state.kind === 'loading' && <p className="text-ink-muted">Finding another way in…</p>}
      {state.kind === 'error' && <p>{state.message}</p>}
      {state.kind === 'ok' && (
        <>
          <div><h3 className="text-sm font-bold text-ink-muted">Another way to see it</h3><p className="mt-1">{state.help.explanation}</p></div>
          <div><h3 className="text-sm font-bold text-ink-muted">Memory aid</h3><p className="mt-1">{state.help.mnemonic}</p></div>
          <div><h3 className="text-sm font-bold text-ink-muted">Think of it like</h3><p className="mt-1">{state.help.analogy}</p></div>
          {state.added > 0 && (
            <Link href={`/study/deck/${deckId}`} className="underline">
              {state.added} new {state.added === 1 ? 'card' : 'cards'} added to your deck for sorting
            </Link>
          )}
        </>
      )}
    </div>
  );
}
