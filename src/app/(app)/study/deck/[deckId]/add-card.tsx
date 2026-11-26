'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { addCard } from './actions';

/** A Q&A card written by hand, kept at once. No AI call. */
export function AddCard({ deckId }: { deckId: string }) {
  const router = useRouter();
  const question = useRef<HTMLTextAreaElement>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [concept, setConcept] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNote(''); setError(''); setBusy(true);
    const r = await addCard(deckId, { front, back, concept })
      .catch(() => ({ ok: false as const, message: "We couldn't add that card. Try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (!r.added) { setNote('That card is already in this deck.'); return; }
    setNote('Added.');
    setFront(''); setBack(''); setConcept('');
    question.current?.focus();
    router.refresh();
  }

  return (
    <section aria-labelledby="add-card-h" className="mb-8 max-w-prose">
      <h2 id="add-card-h" className="hand text-2xl">Add a card</h2>
      <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3">
        <div>
          <label htmlFor="add-front" className="mb-1 block">Question</label>
          <textarea id="add-front" ref={question} rows={2} maxLength={500} required className="field w-full"
            value={front} onChange={(e) => setFront(e.target.value)} />
        </div>
        <div>
          <label htmlFor="add-back" className="mb-1 block">Answer</label>
          <textarea id="add-back" rows={3} maxLength={500} required className="field w-full"
            value={back} onChange={(e) => setBack(e.target.value)} />
        </div>
        <div>
          <label htmlFor="add-concept" className="mb-1 block">Concept (optional)</label>
          <input id="add-concept" maxLength={120} className="field w-full"
            value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>
        <button type="submit" className="btn" disabled={busy}>Add card</button>
        <p role="status" className="empty:hidden">{busy ? 'Adding…' : note}</p>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
    </section>
  );
}
