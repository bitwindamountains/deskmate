'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ESSAY_DRAFT_PREFIX } from '@/lib/essay/text';
import { saveDraft } from '../actions';

const NO_CHANGES = 'No changes since your last check.';
const OFFLINE = "You're offline. Your edits are saved on this device; re-check when you're back online.";
const SAVE_FAILED = "We couldn't save that. Try again.";

export const draftKey = (essayId: string) => `${ESSAY_DRAFT_PREFIX}${essayId}`;

// Storage can throw (private mode, quota, blocked site data); edits then live only in memory.
export function storedDraft(essayId: string): string | null {
  try { return localStorage.getItem(draftKey(essayId)); } catch { return null; }
}

/** Edits the essay. Re-check saves the next draft; the page then refreshes onto it and runs the layers. */
export function Editor({ essayId, content }: { essayId: string; content: string }) {
  const router = useRouter();
  const key = draftKey(essayId);
  const [text, setText] = useState(() => storedDraft(essayId) ?? content);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  function edit(v: string) {
    setText(v);
    setNote(null);
    try { localStorage.setItem(key, v); } catch {}
  }

  async function recheck() {
    setBusy(true);
    setNote(null);
    const r = await saveDraft(essayId, text).catch(() => ({ ok: false as const, error: SAVE_FAILED }));
    if (!r.ok) { setBusy(false); setNote({ error: true, text: r.error }); return; }
    try { localStorage.removeItem(key); } catch {}
    if (r.unchanged) { setBusy(false); setNote({ error: false, text: NO_CHANGES }); return; }
    router.refresh(); // stays busy: the page remounts the view on the new draft
  }

  return (
    <div className="space-y-3">
      <label htmlFor="essay-edit" className="block font-bold">Edit your essay</label>
      <textarea id="essay-edit" rows={18} value={text} onChange={(e) => edit(e.target.value)} className="field w-full" />
      <button type="button" className="btn btn-primary" disabled={busy || !online} aria-describedby={online ? undefined : 'offline-note'}
        onClick={() => void recheck()}>Re-check</button>
      {!online && <p id="offline-note">{OFFLINE}</p>}
      <div role="status" className="empty:hidden">{note && !note.error && <p>{note.text}</p>}</div>
      {note?.error && <p role="alert" className="error">{note.text}</p>}
    </div>
  );
}
