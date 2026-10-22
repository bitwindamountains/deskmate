'use client';

import { useState } from 'react';

export type DialogueKind = 'question' | 'dispute';
export type ThreadMessage = { role: 'student' | 'coach'; kind: DialogueKind; text: string; verdict: string | null };

const LABEL: Record<DialogueKind, string> = { question: 'Ask about this', dispute: "Why doesn't this fit?" };

/** One thread per feedback item (A2.9, A3.10). onSend returns an error message, or null once the reply is in the thread. */
export function ItemDialogue({ itemId, kind, messages, onSend }: {
  itemId: string; kind: DialogueKind | null; messages: ThreadMessage[]; onSend: (kind: DialogueKind, message: string) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const latest = [...messages].reverse().find((m) => m.role === 'coach');

  async function send() {
    if (!kind) return;
    if (!text.trim()) { setError('Add a short message first.'); return; }
    setError('');
    setSending(true);
    const failed = await onSend(kind, text.trim());
    setSending(false);
    if (failed) setError(failed);
    else setText('');
  }

  return (
    <div className="space-y-3 empty:hidden">
      {messages.length > 0 && (
        <ol aria-label="Conversation about this feedback" className="space-y-2">
          {messages.map((m, k) => (
            <li key={k} className={m.role === 'coach' ? 'rounded-lg border border-line p-3' : 'pl-3'}>
              <span className="block text-sm font-bold text-ink-muted">{m.role === 'coach' ? 'Coach' : 'You'}</span>
              <span className="whitespace-pre-wrap">{m.text}</span>
            </li>
          ))}
        </ol>
      )}
      {/* Announces each new coach reply to screen readers; the visible copy is the list above. */}
      <p role="status" className="sr-only">{sending ? 'The coach is replying…' : latest ? `Coach: ${latest.text}` : ''}</p>
      {kind && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor={`msg-${itemId}`} className="block font-bold">{LABEL[kind]}</label>
          {/* autoFocus is fine here: the field opens on the student's own click */}
          <textarea id={`msg-${itemId}`} autoFocus rows={2} maxLength={1000} className="field" value={text}
            aria-invalid={!!error} aria-describedby={error ? `msg-${itemId}-err` : undefined} onChange={(e) => setText(e.target.value)} />
          {error && <p id={`msg-${itemId}-err`} role="alert" className="error">{error}</p>}
          <button type="submit" className="btn" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
        </form>
      )}
    </div>
  );
}
