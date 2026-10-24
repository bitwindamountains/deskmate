'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { findDuplicates } from '@/lib/embed/duplicates';
import { getEmbedder } from '@/lib/embed/embed';
import type { CardRow } from '@/lib/generate/generate-chunk';
import { editCard, saveEmbeddings, setCardStatus } from '../actions';
import { MathText } from '@/components/math-text';

type Reason = 'trivial' | 'wrong' | 'duplicate' | 'unclear';
export type KnownCard = { id: string; front: string; back: string; embedding: number[] | null };
type Problem = { kind: 'quota' | 'session' | 'retry'; message: string; at: number };

const TYPE_LABEL: Record<CardRow['type'], string> = { basic: 'Q&A', cloze: 'Fill in the blank', why: 'Why' };
const REASONS: [Reason, string][] = [['trivial', 'Too trivial'], ['wrong', 'Wrong'], ['duplicate', 'Duplicate'], ['unclear', 'Unclear']];
const BUSY = 'The AI service is busy. Your material is saved; try again in a few minutes.';
const SAVE_FAILED = "We couldn't save that change. Try again.";
const MAX_IDS = 200; // per server-action call
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const batches = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / MAX_IDS) }, (_, i) => xs.slice(i * MAX_IDS, (i + 1) * MAX_IDS));
const snippet = (c: CardRow) => {
  const q = c.source_quote.length > 160 ? `${c.source_quote.slice(0, 160).trimEnd()}…` : c.source_quote;
  return c.page_start ? `From page ${c.page_start}: ${q}` : `From your material: ${q}`;
};

/** todo: positions of chunks not yet generated, in order. pending: this source's pending cards. existing: the deck's kept and pending cards, for dedupe. */
export function Triage({ sourceId, todo, pending, existing }: { sourceId: string; todo: number[]; pending: CardRow[]; existing: KnownCard[] }) {
  const [cards, setCards] = useState<CardRow[]>(pending);
  const [part, setPart] = useState<number | null>(todo.length ? 0 : null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [actionError, setActionError] = useState('');
  const [say, setSay] = useState('');
  const [mode, setMode] = useState<'view' | 'reason' | 'edit'>('view');
  const [draft, setDraft] = useState({ front: '', back: '', error: '' });

  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  const [known] = useState(() => existing.map((k) => ({ ...k })));
  const dedupeChain = useRef(Promise.resolve());
  const loop = useRef<AbortController | null>(null);
  const nextChunk = useRef(0); // index into todo the loop is on; a remount resumes here
  const doneLink = useRef<HTMLAnchorElement>(null);
  const focusNext = useRef<React.RefObject<HTMLElement | null> | null>(null);
  const discardBtn = useRef<HTMLButtonElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);
  const firstChip = useRef<HTMLButtonElement>(null);
  const frontField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { focusNext.current?.current?.focus(); focusNext.current = null; });

  const current = cards.find((c) => c.status === 'pending');
  const left = cards.filter((c) => c.status === 'pending').length;
  const path = `/study/triage/${sourceId}`;

  function move(ids: string[], status: 'kept' | 'discarded', reason?: Reason) {
    setCards((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, status } : c)));
    return Promise.all(batches(ids).map((b) => setCardStatus(b, status, reason))).catch(() => {
      setCards((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, status: 'pending' } : c)));
      setActionError(SAVE_FAILED);
    });
  }

  function keep() {
    if (!current) return;
    setMode('view'); setActionError('');
    move([current.id], 'kept');
    setSay(`Kept. ${left - 1} left.`);
    if (left === 1) focusNext.current = doneLink;
  }

  function discard(reason?: Reason) {
    if (!current) return;
    setMode('view'); setActionError('');
    move([current.id], 'discarded', reason);
    setSay(`Discarded. ${left - 1} left.`);
    focusNext.current = left === 1 ? doneLink : discardBtn;
  }

  function keepAll() {
    const ids = cards.filter((c) => c.status === 'pending').map((c) => c.id);
    if (!ids.length) return;
    setMode('view'); setActionError('');
    move(ids, 'kept');
    setSay(`Kept all ${plural(ids.length, 'card')}.`);
    focusNext.current = doneLink; // Keep all is now disabled
  }

  function openReason() { setMode('reason'); focusNext.current = firstChip; }
  function closeTo(ref: React.RefObject<HTMLElement | null>) { setMode('view'); focusNext.current = ref; }

  function openEdit() {
    if (!current) return;
    setDraft({ front: current.front, back: current.back, error: '' });
    setMode('edit');
    focusNext.current = frontField;
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    const front = draft.front.trim(), back = draft.back.trim();
    if (!front || !back) return setDraft({ ...draft, error: 'Front and back need some text.' });
    if (front.length > 500 || back.length > 500) return setDraft({ ...draft, error: 'Keep each side under 500 characters.' });
    const id = current.id;
    try {
      await editCard(id, { front, back });
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, front, back } : c)));
      setSay('Card saved.');
      closeTo(editBtn);
    } catch {
      setDraft({ ...draft, error: SAVE_FAILED });
    }
  }

  // Best effort, serialized so each batch is compared with every earlier one. No embedder: cards are kept, not lost.
  function dedupe(batch: CardRow[]) {
    dedupeChain.current = dedupeChain.current.then(async () => {
      const fresh = batch.filter((c) => !known.some((k) => k.id === c.id));
      if (!fresh.length) return;
      const embed = await getEmbedder();
      if (!embed) return;
      const missing = known.filter((k) => !k.embedding);
      const vecs = await embed([...missing, ...fresh].map((c) => `${c.front} ${c.back}`));
      missing.forEach((k, i) => { k.embedding = vecs[i]; });
      const items = fresh.map((c, i) => ({ id: c.id, embedding: vecs[missing.length + i] }));
      const dupIds = findDuplicates(items, known.filter((k) => k.embedding) as { id: string; embedding: number[] }[]);
      fresh.forEach((c, i) => { if (!dupIds.includes(c.id)) known.push({ id: c.id, front: c.front, back: c.back, embedding: items[i].embedding }); });
      const rows = [...missing.map((k) => ({ id: k.id, embedding: k.embedding! })), ...items];
      batches(rows).forEach((b) => saveEmbeddings(b).catch(() => {}));
      const dups = dupIds.filter((id) => cardsRef.current.some((c) => c.id === id && c.status === 'pending'));
      if (!dups.length) return;
      await move(dups, 'discarded', 'duplicate');
      setSay(`Skipped ${plural(dups.length, 'duplicate')}.`);
    }).catch(() => {});
  }

  async function run(from: number) {
    loop.current?.abort();
    const ctrl = new AbortController();
    loop.current = ctrl;
    setProblem(null);
    for (let i = from; i < todo.length; i++) {
      nextChunk.current = i;
      setPart(i);
      const stop = (kind: Problem['kind'], message: string) => { setPart(null); setProblem({ kind, message, at: i }); };
      let res: Response;
      try {
        res = await fetch('/api/generate', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId, position: todo[i] }), signal: ctrl.signal,
        });
      } catch {
        return ctrl.signal.aborted ? undefined : stop('retry', BUSY);
      }
      if (ctrl.signal.aborted) return;
      // The proxy no longer redirects /api/*, but an expired session can still surface as a redirect.
      if (res.status === 401 || res.redirected) return stop('session', 'Your session ended.');
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
      const body = isJson ? await res.json().catch(() => null) : null;
      if (ctrl.signal.aborted) return;
      if (res.status === 429 && typeof body?.message === 'string') return stop('quota', body.message);
      if (!res.ok || !Array.isArray(body?.cards)) return stop('retry', BUSY);
      const batch = (body.cards as CardRow[]).filter((c) => c.status === 'pending' && !cardsRef.current.some((x) => x.id === c.id));
      cardsRef.current = [...cardsRef.current, ...batch];
      setCards((cs) => [...cs, ...batch.filter((c) => !cs.some((x) => x.id === c.id))]);
      dedupe(batch);
    }
    nextChunk.current = todo.length;
    setPart(null);
  }

  useEffect(() => {
    // StrictMode mounts twice: the first loop is aborted on cleanup and the remount resumes at the same chunk.
    if (nextChunk.current < todo.length) void run(nextChunk.current);
    return () => loop.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || mode === 'edit' || !current) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') keep();
      else if (e.key === 'ArrowLeft') { if (mode === 'reason') discard(); else openReason(); }
      else if (e.key === 'e' || e.key === 'E') openEdit();
      else if (e.key === 'Escape' && mode === 'reason') closeTo(discardBtn);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const errId = draft.error ? { 'aria-invalid': true, 'aria-describedby': 'edit-err' } : {};
  return (
    <div className="max-w-xl space-y-6">
      {part !== null && <p className="text-ink-muted">Making cards… part {part + 1} of {todo.length}</p>}

      {problem && (
        <div role="alert" className="space-y-3">
          {problem.kind === 'session' ? (
            <p className="error">Your session ended. <Link href={`/login?next=${encodeURIComponent(path)}`} className="underline">Sign in again</Link>.</p>
          ) : <p className="error">{problem.message}</p>}
          {problem.kind === 'quota' && <Link href="/study" className="btn">Back to Study</Link>}
          {problem.kind === 'retry' && <button type="button" className="btn" onClick={() => run(problem.at)}>Try again</button>}
        </div>
      )}
      {actionError && <p role="alert" className="error">{actionError}</p>}

      {cards.length > 0 && <p className="font-bold">{plural(left, 'card')} to review</p>}

      {current ? (
        <section aria-label="Current card" className="space-y-4 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
          <p className="text-sm font-bold text-ink-muted">{TYPE_LABEL[current.type]}</p>
          {mode === 'edit' ? (
            <form onSubmit={saveEdit} className="space-y-4">
              {draft.error && <p id="edit-err" role="alert" className="error">{draft.error}</p>}
              <div>
                <label htmlFor="edit-front" className="mb-1 block">Front</label>
                <textarea ref={frontField} id="edit-front" rows={3} maxLength={500} value={draft.front} className="field" {...errId}
                  onChange={(e) => setDraft({ ...draft, front: e.target.value })} />
              </div>
              <div>
                <label htmlFor="edit-back" className="mb-1 block">Back</label>
                <textarea id="edit-back" rows={4} maxLength={500} value={draft.back} className="field" {...errId}
                  onChange={(e) => setDraft({ ...draft, back: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn" onClick={() => closeTo(editBtn)}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <h2 className="text-xl font-bold text-balance"><MathText text={current.front} /></h2>
              <p className="max-w-prose"><MathText text={current.back} /></p>
              <p className="text-sm text-ink-muted">{snippet(current)}</p>
            </>
          )}
        </section>
      ) : (
        <p className="text-ink-muted">{part !== null ? "Your cards will appear here as they're made." : cards.length ? "You've reviewed every card." : 'No cards to review yet.'}</p>
      )}

      {current && mode !== 'edit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <button ref={discardBtn} type="button" className="btn" aria-keyshortcuts="ArrowLeft" aria-expanded={mode === 'reason'} onClick={openReason}>Discard</button>
            <button ref={editBtn} type="button" className="btn" aria-keyshortcuts="E" onClick={openEdit}>Edit</button>
            <button type="button" className="btn btn-primary" aria-keyshortcuts="ArrowRight" onClick={keep}>Keep</button>
          </div>
          <p className="text-sm text-ink-muted">Keys: → keep, ← discard, E edit.</p>
          {mode === 'reason' && (
            <div role="group" aria-labelledby="reason-label" className="space-y-3">
              <p id="reason-label" className="font-bold">Why discard it? (optional)</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map(([r, label], i) => (
                  <button key={r} ref={i === 0 ? firstChip : undefined} type="button" className="btn" onClick={() => discard(r)}>{label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn" onClick={() => discard()}>Discard without a reason</button>
                <button type="button" className="btn" onClick={() => closeTo(discardBtn)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button type="button" className="btn" disabled={!left} onClick={keepAll}>Keep all</button>
        <Link ref={doneLink} href="/study" className="btn">Done reviewing</Link>
      </div>

      <p role="status" aria-live="polite" className="sr-only">{say}</p>
    </div>
  );
}
