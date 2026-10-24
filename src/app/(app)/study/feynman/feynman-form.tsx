'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FeynmanFeedback } from '@/lib/cards/feynman';

const MIN = 20, MAX = 600; // same as requestFeynman

/** B3.7 Feynman mode: explain a concept in your own words, then see what you covered and missed. */
export function FeynmanForm({ deckId, concept, label }: { deckId: string; concept: string; label: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeynmanFeedback | null>(null);
  const count = text.split(/\s+/).filter(Boolean).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (count < MIN || count > MAX) return setError(`Explain it in ${MIN} to ${MAX} words.`);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/feynman', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deckId, concept, explanation: text }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.feedback) setFeedback(body.feedback);
      else setError(body.message ?? 'Feedback is busy right now. Try again in a minute.');
    } catch {
      setError("We couldn't reach Scholar. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="max-w-prose space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <p>Explain <strong>{label}</strong> as if to a friend who missed the class. Use your own words; no notes.</p>
        <label htmlFor="explanation" className="block font-bold">Your explanation</label>
        <textarea id="explanation" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="field w-full"
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'feynman-err feynman-count' : 'feynman-count'} />
        <p id="feynman-count" className="text-sm text-ink-muted">{count} {count === 1 ? 'word' : 'words'} ({MIN} to {MAX})</p>
        {error && <p id="feynman-err" role="alert" className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Check my explanation'}</button>
      </form>

      {feedback && (
        <section aria-labelledby="feynman-h" className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <h2 id="feynman-h" className="text-xl font-bold">How your explanation went</h2>
          {feedback.covered.length > 0 && (
            <div><h3 className="font-bold">You covered</h3><ul className="list-disc pl-6">{feedback.covered.map((c) => <li key={c}>{c}</li>)}</ul></div>
          )}
          {feedback.missed.length > 0 && (
            <div><h3 className="font-bold">Worth adding</h3><ul className="list-disc pl-6">{feedback.missed.map((c) => <li key={c}>{c}</li>)}</ul></div>
          )}
          {feedback.misconception && (
            <div><h3 className="font-bold">One thing to rethink</h3><p>{feedback.misconception}</p></div>
          )}
          {feedback.added > 0 && (
            <Link href={`/study/deck/${deckId}`} className="underline">
              {`${feedback.added} new ${feedback.added === 1 ? 'card waits' : 'cards wait'} in your deck`}
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
