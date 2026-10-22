import Link from 'next/link';
import { EmptyStudy } from '@/components/empty-study';
import type { Deck, ReviewCard } from '@/lib/review/load';
import { buildSession, daysUntil, nextReview, parseDay, readiness } from '@/review/schedule';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/** An essay whose latest draft still has open Top 3 priorities. */
export type TodayEssay = { id: string; title: string; openTop3: number };

/** zone: the student's time zone, since this renders on the server (whose clock is UTC). */
export function TodayPlan({ decks, cards, minutes, newIntroducedToday, now, essays = [], zone = 'UTC' }:
  { decks: Deck[]; cards: ReviewCard[]; minutes: number; newIntroducedToday: number; now: Date; essays?: TodayEssay[]; zone?: string }) {
  if (!cards.length && !essays.length) return <EmptyStudy />;

  const exams = decks.flatMap((d) => {
    if (!d.exam_date) return [];
    const date = parseDay(d.exam_date, zone);
    const days = daysUntil(date, now, zone);
    return days < 0 ? [] : [{ deck: d, date, days, ready: Math.round(readiness(cards.filter((c) => c.deckId === d.id), date) * 100) }];
  }).sort((a, b) => a.days - b.days);
  // Spec §8.3 order: reviews, essays with open priorities, exams. Essays have no deadline yet, so due reviews stay primary.
  const { queue, estMinutes } = buildSession(cards, { now, minutes, newIntroducedToday, examDate: exams.find((e) => e.days > 0)?.date ?? null, zone });
  const next = nextReview(cards, now, zone);
  const noExam = decks.filter((d) => !exams.some((e) => e.deck.id === d.id));
  const essayFirst = !queue.length && essays.length > 0;
  const essayLines = essayFirst ? essays.slice(1) : essays;
  const priorities = (n: number) => `${n} of 3 priorities open`;

  return (
    <div className="max-w-xl space-y-8">
      {essayFirst && (
        <section aria-labelledby="essay-h" className="rounded-xl border border-line bg-surface p-6 [overflow-wrap:anywhere]">
          <h2 id="essay-h" className="text-xl font-bold text-balance">{essays[0].title}</h2>
          <p className="mt-2 text-[1.2rem]">{priorities(essays[0].openTop3)}</p>
          <Link href={`/write/${essays[0].id}`} className="btn btn-primary mt-6">Keep revising</Link>
        </section>
      )}

      {cards.length > 0 && <section aria-labelledby="reviews-h" className="rounded-xl border border-line bg-surface p-6">
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
      </section>}

      {essayLines.length > 0 && (
        <section aria-labelledby="essays-h">
          <h2 id="essays-h" className="mb-3 text-xl font-bold">Essays</h2>
          <ul className="space-y-3">
            {essayLines.map((e) => (
              <li key={e.id} className="[overflow-wrap:anywhere]">
                <Link href={`/write/${e.id}`} className="underline">{e.title} · {priorities(e.openTop3)}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decks.length > 0 && <section aria-labelledby="exams-h">
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
      </section>}
    </div>
  );
}
