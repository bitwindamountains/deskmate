'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { sendReport } from '@/app/(app)/report-actions';
import type { ReportInput } from '@/lib/report/report-problem';

type Target = ReportInput['target'];
const REASONS: Record<Target, [ReportInput['reason'], string][]> = {
  card: [['wrong', 'The answer is wrong'], ['unclear', 'The question is unclear'], ['not_in_source', "It's not in my material"],
    ['grading', 'My answer was graded wrong'], ['other', 'Something else']],
  feedback_item: [['wrong', 'The feedback is wrong'], ['unclear', "It's unclear"], ['unfair', "It's unfair to how I write"],
    ['other', 'Something else']],
};

/** Brief lines 442 and 853: "Report a problem" on every card and piece of feedback. */
export function ReportProblem({ target, targetId }: { target: Target; targetId: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const restore = useRef(false);

  useEffect(() => {
    if (open) first.current?.focus();
    else if (restore.current) trigger.current?.focus();
  }, [open]);

  function close() {
    restore.current = true;
    setError('');
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const reason = form.get('reason') as ReportInput['reason'] | null;
    if (!reason) return setError('Choose what is wrong.');
    setBusy(true);
    setError('');
    try {
      await sendReport({ target, targetId, reason, note: String(form.get('note') ?? '') });
      setSent(true);
    } catch {
      setError("We couldn't send that report. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (sent) return <p role="status" className="text-sm text-ink-muted">Thanks. Reports like this help us fix Scholar.</p>;
  if (!open) {
    return <button ref={trigger} type="button" className="text-sm underline" aria-expanded={false} onClick={() => setOpen(true)}>Report a problem</button>;
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-line p-3">
      <fieldset aria-describedby={error ? `${id}-err` : undefined}>
        <legend className="font-bold">What&apos;s wrong?</legend>
        {REASONS[target].map(([value, label], i) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input ref={i === 0 ? first : undefined} type="radio" name="reason" value={value} />
            {label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm font-bold">Anything to add? (optional)</label>
        <textarea id={`${id}-note`} name="note" maxLength={500} rows={2} className="field w-full" />
      </div>
      {error && <p id={`${id}-err`} role="alert" className="error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        <button type="button" className="btn" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
