import Link from 'next/link';
import { EmptyStudy } from '@/components/empty-study';
import type { Deck, ReviewCard } from '@/lib/review/load';
import { buildSession, daysUntil, nextReview, parseDay, readiness } from '@/review/schedule';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

export function TodayPlan({ decks, cards, minutes, newIntroducedToday, now }:
  { decks: Deck[]; cards: ReviewCard[]; minutes: number; newIntroducedToday: number; now: Date }) {
  if (!cards.length) return <EmptyStudy />;

  const exams = decks.flatMap((d) => {
    if (!d.exam_date) return [];
    const date = parseDay(d.exam_date);
    const days = daysUntil(date, now);
    return days < 0 ? [] : [{ deck: d, date, days, ready: Math.round(readiness(cards.filter((c) => c.deckId === d.id), date) * 100) }];
  }).sort((a, b) => a.days - b.days);
  // Today's reviews are the only item for now (essays arrive in Phase 1b), so they are the primary action.
  const { queue, estMinutes } = buildSession(cards, { now, minutes, newIntroducedToday, examDate: exams.find((e) => e.days > 0)?.date ?? null });
  const next = nextReview(cards, now);
  const noExam = decks.filter((d) => !exams.some((e) => e.deck.id === d.id));

  return (
    <div className="max-w-xl space-y-8">
      <section aria-labelledby="reviews-h" className="rounded-xl border border-line bg-surface p-6">
        <h2 id="reviews-h" className="text-xl font-bold text-balance">Reviews</h2>
        {queue.length ? (
          <>
            <p className="mt-2 text-[1.2rem]">{plural(queue.length, 'card')} · ~{estMinutes} min</p>
            <Link href="/study/review" className="btn btn-primary mt-6">Start</Link>
          </>
        ) : (
          <p className="mt-2">
            You&apos;re all caught up.{next && ` Next review: ${next.label}, about ${plural(next.count, 'card')}.`}
          </p>
        )}
      </section>

      <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="mb-3 text-xl font-bold">Exams</h2>
        <ul className="space-y-3">
          {exams.map((e) => (
            <li key={e.deck.id} className="flex flex-wrap items-center justify-between gap-3 [overflow-wrap:anywhere]">
              <span>{e.deck.title} exam {when(e.days)} · {e.ready}% ready</span>
              <Link href={`/study/deck/${e.deck.id}/exam`} className="underline" aria-label={`Change ${e.deck.title} exam date`}>Change</Link>
            </li>
          ))}
          {noExam.map((d) => (
            <li key={d.id} className="[overflow-wrap:anywhere]">
              <Link href={`/study/deck/${d.id}/exam`} className="underline">Set an exam date for {d.title}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
