import Link from 'next/link';
import { EmptyStudy } from '@/components/empty-study';
import { parseDay } from '@/review/schedule';

export type DeckSummary = { id: string; title: string; exam_date: string | null; kept: number; due: number; fresh: number;
  /** sources in this deck with cards still waiting for keep/discard */
  triage: { sourceId: string; title: string; pending: number }[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const examDay = (d: string) => parseDay(d).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });

export function DeckList({ decks }: { decks: DeckSummary[] }) {
  if (!decks.length) return <EmptyStudy level={3} />;
  return (
    <>
      <ul className="max-w-xl space-y-4">
        {decks.map((d) => (
          <li key={d.id}>
            <section aria-labelledby={`deck-${d.id}`} className="space-y-3 rounded-xl border border-line bg-surface p-5 [overflow-wrap:anywhere]">
              <h3 id={`deck-${d.id}`} className="text-xl font-bold text-balance">{d.title}</h3>
              <p className="text-ink-muted">
                {plural(d.kept, 'card')}
                {d.kept > 0 && ` · ${d.due} due · ${d.fresh} new`}
              </p>
              {d.triage.map((t) => (
                <p key={t.sourceId}>
                  <Link href={`/study/triage/${t.sourceId}`} className="underline">
                    Sort {plural(t.pending, 'new card')} from {t.title}
                  </Link>
                </p>
              ))}
              <p>
                {d.exam_date ? <>Exam: {examDay(d.exam_date)} · </> : null}
                <Link href={`/study/deck/${d.id}/exam`} className="underline" aria-label={`${d.exam_date ? 'Change' : 'Set'} ${d.title} exam date`}>
                  {d.exam_date ? 'Change' : 'Set exam date'}
                </Link>
              </p>
            </section>
          </li>
        ))}
      </ul>
      <Link href="/study/import" className="btn mt-6">Import material</Link>
    </>
  );
}
