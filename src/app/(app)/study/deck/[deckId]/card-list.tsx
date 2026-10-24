'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { removeCards, saveCard, setStatus } from './actions';
import { MathText } from '@/components/math-text';

export type EditorCard = { id: string; type: 'basic' | 'cloze' | 'why'; front: string; back: string; concept: string;
  status: 'pending' | 'kept' | 'suspended'; lapses: number; sourceId: string | null };

const TYPE_LABEL: Record<EditorCard['type'], string> = { basic: 'Q&A', cloze: 'Fill in the blank', why: 'Why' };
const STATUS_LABEL: Record<EditorCard['status'], string> = { kept: 'Kept', pending: 'Not sorted yet', suspended: 'Suspended' };
const SAVE_FAILED = "We couldn't save that change. Try again.";
const MAX_IDS = 200; // per server-action call
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const batches = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / MAX_IDS) }, (_, i) => xs.slice(i * MAX_IDS, (i + 1) * MAX_IDS));
const conceptKey = (c: string) => c.trim().toLowerCase();

export function CardList({ cards: initial }: { cards: EditorCard[] }) {
  const [cards, setCards] = useState(initial);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatusFilter] = useState('');
  const [concept, setConcept] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<{ id: string; front: string; back: string; error: string; suggested?: boolean } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const [say, setSay] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useRef<HTMLInputElement>(null);
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirming) cancelBtn.current?.focus(); }, [confirming]);

  const concepts = [...new Map(cards.map((c) => [conceptKey(c.concept), c.concept.trim()])).entries()];
  const q = query.trim().toLowerCase();
  const shown = cards.filter((c) => (!q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q))
    && (!type || c.type === type) && (!status || c.status === status) && (!concept || conceptKey(c.concept) === concept));
  // Bulk actions only touch rows the student can see, so a filter never hides what is about to change.
  const picked = shown.filter((c) => selected.has(c.id));
  const toSuspend = picked.filter((c) => c.status === 'kept').map((c) => c.id);
  const toUnsuspend = picked.filter((c) => c.status === 'suspended').map((c) => c.id);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function act(run: () => Promise<unknown>, done: () => void) {
    setError(''); setBusy(true);
    try {
      await run();
      done();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  function changeStatus(ids: string[], to: 'kept' | 'suspended') {
    if (!ids.length) return;
    return act(() => Promise.all(batches(ids).map((b) => setStatus(b, to))), () => {
      setCards((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, status: to } : c)));
      setSay(`${to === 'suspended' ? 'Suspended' : 'Unsuspended'} ${plural(ids.length, 'card')}.`);
    });
  }

  function remove() {
    const ids = picked.map((c) => c.id);
    return act(() => Promise.all(batches(ids).map((b) => removeCards(b))), () => {
      setCards((cs) => cs.filter((c) => !ids.includes(c.id)));
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
      setConfirming(false);
      setSay(`Deleted ${plural(ids.length, 'card')}.`);
      search.current?.focus();
    });
  }

  function cancelDelete() { setConfirming(false); deleteBtn.current?.focus(); }

  // B-S8 "Improve with AI": the same rewrite as triage's Improve; it fills the form only if that card is still being edited.
  async function suggest() {
    if (!editing) return;
    const id = editing.id;
    setSuggesting(true);
    try {
      const res = await fetch('/api/cards/improve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId: id }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.suggestion) setSay('Suggested rewrite filled in. Check it, then Save.');
      setEditing((cur) => (!cur || cur.id !== id ? cur : res.ok && body.suggestion
        ? { ...cur, front: body.suggestion.front, back: body.suggestion.back, error: '', suggested: true }
        : { ...cur, error: body.message ?? 'Help is busy right now. Try again in a minute.' }));
    } catch {
      setEditing((cur) => (cur && cur.id === id ? { ...cur, error: "We couldn't reach Scholar. Check your connection and try again." } : cur));
    } finally {
      setSuggesting(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const front = editing.front.trim(), back = editing.back.trim();
    if (!front || !back) return setEditing({ ...editing, error: 'Front and back need some text.' });
    if (front.length > 500 || back.length > 500) return setEditing({ ...editing, error: 'Keep each side under 500 characters.' });
    const { id } = editing;
    try {
      await saveCard(id, { front, back });
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, front, back } : c)));
      setEditing(null);
      setSay('Card saved.');
    } catch {
      setEditing({ ...editing, error: SAVE_FAILED });
    }
  }

  if (!cards.length) return <p className="text-ink-muted">No cards in this deck yet.</p>;
  const errId = editing?.error ? { 'aria-invalid': true, 'aria-describedby': 'edit-err' } : {};
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="card-search" className="mb-1 block">Search cards</label>
          <input ref={search} id="card-search" type="search" className="field" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <label htmlFor="filter-type" className="mb-1 block">Type</label>
          <select id="filter-type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className="mb-1 block">Status</label>
          <select id="filter-status" className="field" value={status} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="filter-concept" className="mb-1 block">Concept</label>
          <select id="filter-concept" className="field" value={concept} onChange={(e) => setConcept(e.target.value)}>
            <option value="">All concepts</option>
            {concepts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={!shown.length} onClick={() => setSelected((s) => new Set([...s, ...shown.map((c) => c.id)]))}>Select all shown</button>
          {selected.size > 0 && <button type="button" className="btn" onClick={() => setSelected(new Set())}>Clear selection</button>}
          <p className="font-bold">{picked.length} selected</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" disabled={busy || !toSuspend.length} onClick={() => changeStatus(toSuspend, 'suspended')}>Suspend selected</button>
          <button type="button" className="btn" disabled={busy || !toUnsuspend.length} onClick={() => changeStatus(toUnsuspend, 'kept')}>Unsuspend selected</button>
          <button ref={deleteBtn} type="button" className="btn" disabled={busy || !picked.length} aria-expanded={confirming} onClick={() => setConfirming(true)}>Delete selected</button>
        </div>
        {confirming && picked.length > 0 && (
          <div role="group" aria-labelledby="confirm-delete" className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <p id="confirm-delete" className="font-bold">Delete {plural(picked.length, 'card')}? Their review history goes too.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn" disabled={busy} onClick={remove}>Delete</button>
              <button ref={cancelBtn} type="button" className="btn" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.id} className="space-y-2 rounded-xl border border-line bg-surface p-4 [overflow-wrap:anywhere]">
              {editing?.id === c.id ? (
                <form onSubmit={saveEdit} className="space-y-4">
                  {editing.suggested && <p className="text-ink-muted">Suggested rewrite. Change anything, then Save. Cancel keeps the card as it was.</p>}
                  {editing.error && <p id="edit-err" role="alert" className="error">{editing.error}</p>}
                  <div>
                    <label htmlFor={`front-${c.id}`} className="mb-1 block">Front</label>
                    {/* read-only while a rewrite is on its way, so it never lands on top of the student's typing */}
                    <textarea id={`front-${c.id}`} rows={3} maxLength={500} value={editing.front} className="field" autoFocus readOnly={suggesting} {...errId}
                      onChange={(e) => setEditing({ ...editing, front: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`back-${c.id}`} className="mb-1 block">Back</label>
                    <textarea id={`back-${c.id}`} rows={4} maxLength={500} value={editing.back} className="field" readOnly={suggesting} {...errId}
                      onChange={(e) => setEditing({ ...editing, back: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className="btn btn-primary">Save</button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="btn" disabled={suggesting} onClick={suggest}>{suggesting ? 'Suggesting…' : 'Suggest a rewrite'}</button>
                  </div>
                </form>
              ) : (
                <>
                  <label className="flex min-h-11 items-start gap-3">
                    <input type="checkbox" className="mt-0.5 shrink-0" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span id={`front-text-${c.id}`} className="font-bold"><MathText text={c.front} /></span>
                  </label>
                  <p className="max-w-prose"><MathText text={c.back} /></p>
                  {/* E2: AI-made cards are labelled; hand-written, imported and practice cards have no source passage. */}
                  <p className="text-sm text-ink-muted">{TYPE_LABEL[c.type]} · {c.concept} · {STATUS_LABEL[c.status]}</p>
                  {c.sourceId && <p className="text-sm text-ink-muted">Made by AI from your notes</p>}
                  {c.lapses >= 4 && <p className="text-sm font-bold">Slipping</p>}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button type="button" className="btn" aria-describedby={`front-text-${c.id}`}
                      onClick={() => setEditing({ id: c.id, front: c.front, back: c.back, error: '' })}>Edit</button>
                    {c.status === 'pending'
                      ? c.sourceId && <Link href={`/study/triage/${c.sourceId}`} className="btn" aria-describedby={`front-text-${c.id}`}>Sort this card</Link>
                      : <button type="button" className="btn" disabled={busy} aria-describedby={`front-text-${c.id}`}
                          onClick={() => changeStatus([c.id], c.status === 'kept' ? 'suspended' : 'kept')}>{c.status === 'kept' ? 'Suspend' : 'Unsuspend'}</button>}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-ink-muted">No cards match.</p>}

      <p role="status" aria-live="polite" className="sr-only">{say}</p>
    </div>
  );
}
