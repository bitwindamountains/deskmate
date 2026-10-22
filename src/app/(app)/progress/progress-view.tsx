'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trendCopy, type PatternStat } from '@/growth/profile';
import { TEMPLATES } from '@/growth/templates';
import { practicePattern } from './actions';

type Props = {
  growth: { essays: number; recurring: PatternStat[] };
  calibration: { recall: number | null; writing: number | null; combined: number | null };
  counts: { answers: number; criteria: number };
  hint: number | null;
  leech: number | null;
};

// One shared busy flag: the first request creates the practice deck, so a second tap anywhere must wait for it.
function Practice({ stat, busy, setBusy }: { stat: PatternStat; busy: boolean; setBusy: (b: boolean) => void }) {
  const [note, setNote] = useState('');
  async function add() {
    setBusy(true);
    const r = await practicePattern(stat.key).catch(() => ({ ok: false as const, message: "We couldn't add those cards. Try again." }));
    setBusy(false);
    setNote(!r.ok ? r.message : r.added ? `Added ${r.added} practice cards to Writing practice.` : 'Already in your Writing practice deck.');
  }
  return (
    <>
      <button type="button" className="btn" disabled={busy} aria-label={`Practice this: ${stat.label}`} onClick={() => void add()}>Practice this</button>
      <p role="status" className="text-sm empty:hidden">{note}</p>
    </>
  );
}

/** The learner profile (C2): writing patterns, one calibration score across both tools, and study habits. */
export function ProgressView({ growth, calibration, counts, hint, leech }: Props) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="max-w-prose space-y-8">
      <section aria-labelledby="patterns-h" className="space-y-3">
        <h2 id="patterns-h" className="text-xl font-bold">Writing patterns</h2>
        {growth.essays === 0 ? <p className="text-ink-muted">Check an essay to see your writing patterns.</p>
          : growth.recurring.length === 0 ? <p className="text-ink-muted">No pattern has come up in two essays yet.</p> : (
            <ul className="divide-y divide-line/40 rounded-xl border border-line bg-surface px-4">
              {growth.recurring.map((p) => (
                <li key={p.key} className="space-y-2 py-3">
                  <p className="font-bold">{p.label}</p>
                  <p className="text-sm text-ink-muted">{`In ${p.essays} of ${growth.essays} essays`}{trendCopy(p.trend) && ` · ${trendCopy(p.trend)}`}</p>
                  {TEMPLATES[p.key] && <Practice stat={p} busy={adding} setBusy={setAdding} />}
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="calibration-h" className="space-y-3">
        <h2 id="calibration-h" className="text-xl font-bold">Self-check accuracy</h2>
        <p className="text-ink-muted">How well your own confidence matches how you actually did.</p>
        <dl className="space-y-2">
          <div><dt className="inline font-bold">Flashcards: </dt><dd className="inline">{calibration.recall !== null
            ? `${calibration.recall}% (from ${counts.answers} answers)` : 'answer with a confidence level 10 times to see this.'}</dd></div>
          <div><dt className="inline font-bold">Essays: </dt><dd className="inline">{calibration.writing !== null
            ? `${calibration.writing}% (from ${counts.criteria} criteria)` : counts.criteria > 0 ? 'rate at least 3 criteria yourself to see this.'
            : 'rate an essay yourself before feedback to see this.'}</dd></div>
          {calibration.combined !== null && <div><dt className="inline font-bold">Both tools: </dt><dd className="inline">{`${calibration.combined}%`}</dd></div>}
        </dl>
      </section>

      <section aria-labelledby="habits-h" className="space-y-3">
        <h2 id="habits-h" className="text-xl font-bold">Habits</h2>
        <ul className="space-y-1">
          <li>{hint !== null ? `Deepest hint you usually open: ${hint} of 5` : 'Deepest hint you usually open: none opened yet'}</li>
          <li>{leech !== null ? `Cards that keep slipping: ${leech}%` : 'Cards that keep slipping: no cards studied yet'}</li>
        </ul>
        <Link href="/study/mastery" className="btn">See your mastery map</Link>
      </section>
    </div>
  );
}
