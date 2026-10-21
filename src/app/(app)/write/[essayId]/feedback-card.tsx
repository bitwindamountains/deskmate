'use client';

import { useState } from 'react';
import type { ItemRow } from '@/lib/essay/analyze';

export const LAYER_LABEL = { global: 'Big picture', paragraph: 'Paragraph', sentence: 'Sentence', strength: 'Strength' } as const;
export const LAYER_BG = { global: 'bg-layer-global', paragraph: 'bg-layer-paragraph', sentence: 'bg-layer-sentence', strength: 'bg-layer-strength' } as const;
export const REWRITE_CAP = 3;
const LEVEL_LABEL = ['Hint 1', 'Hint 2', 'Explanation', 'Example', 'Suggested rewrite'];
const STATUS_LABEL: Record<string, string> = { got_it: 'Got it', disputed: 'Disputed', addressed: 'Addressed', partial: 'Partly addressed' };

export const isOpen = (status: string) => status === 'open' || status === 'partial';

/** What a card needs from the screen: shared state lives in EssayView so the panel and focus mode agree. */
export type CardApi = {
  status: (it: ItemRow) => string;
  shown: (it: ItemRow) => number;
  note: (it: ItemRow) => string | undefined;
  busy: (it: ItemRow) => boolean;
  rewritesLeft: number;
  markId: (it: ItemRow) => string | null;
  nextHint: (it: ItemRow) => void;
  gotIt: (it: ItemRow) => Promise<boolean>;
  dispute: (it: ItemRow, reason: string) => Promise<boolean>;
  showInEssay: (it: ItemRow) => void;
};

export function FeedbackCard({ item: it, api, heading = 'h3', children }:
  { item: ItemRow; api: CardApi; heading?: 'h3' | 'h4'; children?: React.ReactNode }) {
  const H = heading;
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState(false);
  const status = api.status(it);
  const shown = api.shown(it);
  const lt = it.source === 'languagetool';
  // index = level - 1; a level can be empty when the model skipped hints 1-2

  async function send() {
    if (!reason.trim()) { setError('Add a short reason first.'); return; }
    setError('');
    if (await api.dispute(it, reason.trim())) setDisputing(false);
    else setError("We couldn't save that. Try again.");
  }

  return (
    <article id={`card-${it.id}`} tabIndex={-1} aria-labelledby={`card-${it.id}-t`}
      className="space-y-3 rounded-xl border border-line bg-surface p-4 [overflow-wrap:anywhere]">
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <span className={`rounded-md px-2 py-0.5 ${LAYER_BG[it.layer]}`}>{LAYER_LABEL[it.layer]}</span>
        {it.convention && <span className="text-ink-muted">Academic convention</span>}
        {STATUS_LABEL[status] && <span className="rounded-md border border-line px-2 py-0.5">{STATUS_LABEL[status]}</span>}
      </p>
      <H id={`card-${it.id}-t`} className="font-bold">{it.summary}</H>
      {it.quote && <blockquote className="border-l-2 border-line pl-3 text-ink-muted">“{it.quote}”</blockquote>}

      {shown > 0 && (
        <ol className="space-y-2">
          {[0, 1, 2, 3].map((i) => it.hints[i] ?? '').concat(it.rewrite ?? '').slice(0, shown).map((text, i) => text && (
            <li key={i}>
              <span className="block text-sm font-bold text-ink-muted">{LEVEL_LABEL[i]}</span>
              <span className="whitespace-pre-wrap">{text}</span>
              {i === 4 && <span className="mt-1 block text-sm text-ink-muted">{api.rewritesLeft} of {REWRITE_CAP} suggested rewrites left for this draft.</span>}
            </li>
          ))}
        </ol>
      )}
      {lt && suggestion && (
        <p><span className="font-bold">Suggestion: </span>{it.replacements.map((r, i) => <span key={i}>{i > 0 && ', '}<q>{r}</q></span>)}</p>
      )}

      <div role="status" className="empty:hidden">
        {api.busy(it) && <p className="text-ink-muted">Getting the next hint…</p>}
        {api.note(it) && <p className="font-bold">{api.note(it)}</p>}
        {!lt && shown === 4 && !it.rewrite && api.rewritesLeft > 0 && (
          <p className="text-sm text-ink-muted">Next is a suggested rewrite. {api.rewritesLeft} of {REWRITE_CAP} left for this draft.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!lt && shown < 5 && <button type="button" className="btn" disabled={api.busy(it)} onClick={() => api.nextHint(it)}>Show next hint</button>}
        {lt && it.replacements.length > 0 && !suggestion && <button type="button" className="btn" onClick={() => setSuggestion(true)}>Show suggestion</button>}
        {api.markId(it)
          ? <button type="button" className="btn" onClick={() => api.showInEssay(it)}>Show in essay</button>
          : <p className="flex min-h-11 items-center text-sm text-ink-muted">Covers the whole essay</p>}
        {isOpen(status) && (
          <>
            <button type="button" className="btn" onClick={() => void api.gotIt(it)}>Got it</button>
            <button type="button" className="btn" aria-expanded={disputing} onClick={() => { setDisputing((d) => !d); setError(''); }}>I disagree</button>
          </>
        )}
        {children}
      </div>

      {disputing && isOpen(status) && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor={`reason-${it.id}`} className="block font-bold">Why doesn&apos;t this fit?</label>
          {/* autoFocus is fine here: the field opens on the student's own click */}
          <textarea id={`reason-${it.id}`} autoFocus rows={2} maxLength={1000} className="field" value={reason}
            aria-invalid={!!error} aria-describedby={error ? `reason-${it.id}-err` : undefined} onChange={(e) => setReason(e.target.value)} />
          {error && <p id={`reason-${it.id}-err`} role="alert" className="error">{error}</p>}
          <button type="submit" className="btn">Send</button>
        </form>
      )}
    </article>
  );
}
