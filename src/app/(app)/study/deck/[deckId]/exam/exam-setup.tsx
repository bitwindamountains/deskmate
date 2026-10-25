'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReviewCard } from '@/lib/review/load';
import { daysUntil, newCardCapacity, parseDay, readiness } from '@/review/schedule';
import { setExamDate } from './actions';

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function ExamSetup({ deckId, examDate, cards, minutes }: { deckId: string; examDate: string | null; cards: ReviewCard[]; minutes: number }) {
  const [saved, setSaved] = useState(examDate);
  const [date, setDate] = useState(examDate ?? '');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const today = localToday();

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;
  const exam = valid ? parseDay(date) : null;
  const days = exam ? daysUntil(exam, new Date()) : 0;
  const newCount = cards.filter((c) => !c.state).length;
  const capacity = exam ? newCardCapacity(newCount, days, minutes) : newCount;

  async function save(next: string | null) {
    if (next !== null && next < today) { setError('Pick a date from today onward.'); return; }
    setBusy(true);
    setError('');
    const r = await setExamDate(deckId, next).catch(() => ({ ok: false, error: "We couldn't save that change." }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "We couldn't save that change."); return; }
    setSaved(next);
    if (next === null) setDate('');
    setStatus(next ? 'Exam date saved.' : 'Exam date removed.');
  }

  return (
    <div className="max-w-xl space-y-6">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(date); }}>
        {error && <p role="alert" className="error">{error}</p>}
        <div>
          <label htmlFor="exam-date" className="mb-1 block font-bold">Exam date</label>
          <input id="exam-date" type="date" min={today} value={date} className="field max-w-xs" required
            aria-invalid={!!error} onChange={(e) => { setDate(e.target.value); setStatus(''); }} />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy || !date}>Save exam date</button>
          {saved && <button type="button" className="btn" disabled={busy} onClick={() => void save(null)}>Remove exam date</button>}
        </div>
        <p role="status" className="empty:hidden">{status}</p>
      </form>

      {exam && (
        <section aria-labelledby="forecast-h" className="space-y-2 inlay p-5">
          <h2 id="forecast-h" className="hand text-2xl">Forecast</h2>
          <p>
            If you stopped studying now, you&apos;d remember about {Math.round(readiness(cards, exam) * 100)}% of this deck on exam day.
            Each review raises it.
          </p>
          {capacity < newCount && (
            <p>
              At {minutes} minutes a day you can start about {capacity} of the {newCount} new cards before the exam.
              The most important ones come first.
            </p>
          )}
        </section>
      )}

      <Link href="/today" className="underline">Back to Today</Link>
    </div>
  );
}
