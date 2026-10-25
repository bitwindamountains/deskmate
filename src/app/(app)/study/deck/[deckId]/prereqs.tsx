'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addPrereq, removePrereq } from './actions';

type Concept = { key: string; label: string };

/** B4.1: the student says which concepts build on which; the mastery map uses it when a concept keeps being missed. */
export function Prereqs({ deckId, concepts, edges }: { deckId: string; concepts: Concept[]; edges: { concept: string; prereq: string }[] }) {
  const router = useRouter();
  const [concept, setConcept] = useState('');
  const [prereq, setPrereq] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // An edge whose concept lost its cards still shows (by its stored key) so it can be removed.
  const label = (key: string) => concepts.find((c) => c.key === key)?.label ?? key;

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) {
    setError(''); setNote(''); setBusy(true);
    const r = await action().catch(() => ({ ok: false as const, message: "We couldn't save that." }));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNote(done);
    router.refresh();
  }

  if (concepts.length < 2 && !edges.length) return null; // needs two concepts to link
  return (
    <section aria-labelledby="prereqs-h" className="mb-8 max-w-prose space-y-3">
      <h2 id="prereqs-h" className="hand text-2xl">What builds on what</h2>
      <p className="text-ink-muted">When you keep missing a concept, the mastery map suggests reviewing what it builds on.</p>
      {edges.length > 0 && (
        <ul className="space-y-2">
          {edges.map((e) => {
            const name = `${label(e.concept)} builds on ${label(e.prereq)}`;
            return (
              <li key={`${e.concept}\n${e.prereq}`} className="flex flex-wrap items-center gap-3">
                <span>{name}</span>
                <button type="button" className="btn" disabled={busy} aria-label={`Remove ${name}`}
                  onClick={() => void run(() => removePrereq(deckId, e.concept, e.prereq), 'Removed.')}>Remove</button>
              </li>
            );
          })}
        </ul>
      )}
      {concepts.length >= 2 && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(ev) => {
          ev.preventDefault();
          if (concept && prereq) void run(() => addPrereq(deckId, concept, prereq), 'Added.');
        }}>
          <div>
            <label htmlFor="prereq-concept" className="mb-1 block">This concept</label>
            <select id="prereq-concept" className="field" value={concept} onChange={(e) => { setConcept(e.target.value); if (e.target.value === prereq) setPrereq(''); }}>
              <option value="">Choose…</option>
              {concepts.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="prereq-on" className="mb-1 block">Builds on</label>
            <select id="prereq-on" className="field" value={prereq} onChange={(e) => setPrereq(e.target.value)}>
              <option value="">Choose…</option>
              {concepts.filter((c) => c.key !== concept).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn" disabled={busy || !concept || !prereq}>Add</button>
        </form>
      )}
      <p role="status" className="empty:hidden">{note}</p>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
