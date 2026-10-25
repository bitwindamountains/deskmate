import Link from 'next/link';
import type { Deck, ReviewCard } from '@/lib/review/load';
import { buildSession, daysUntil, NEW_CARD_LIMIT, nextReview, parseDay, readiness } from '@/review/schedule';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/** A cassette hub at each end of the tape: it turns while the tape spools on load, then stops. */
function Reel() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10.25" />
      <g className="reel">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 1.75v4.75M12 17.5v4.75M3.1 6.9l4.1 2.4M16.8 14.7l4.1 2.4M3.1 17.1l4.1-2.4M16.8 9.3l4.1-2.4" />
      </g>
    </svg>
  );
}

/** An essay whose latest draft still has open Top 3 priorities. */
export type TodayEssay = { id: string; title: string; openTop3: number };

/** zone: the student's time zone, since this renders on the server (whose clock is UTC). */
export function TodayPlan({ decks, cards, minutes, newIntroducedToday, now, essays = [], zone = 'UTC', newLimit }:
  { decks: Deck[]; cards: ReviewCard[]; minutes: number; newIntroducedToday: number; now: Date; essays?: TodayEssay[]; zone?: string;
    newLimit?: number }) {
  // C4: a new student picks their first action here, in either tool.
  if (!cards.length && !essays.length) {
    return (
      <section className="inlay max-w-prose p-6">
        <h2 className="hand text-2xl text-balance">Where would you like to start?</h2>
        <p className="mt-2 text-ink-muted">Get coaching on a draft, or turn your notes into a few good flashcards.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/write/new" className="btn btn-primary">Get feedback on an essay</Link>
          <Link href="/study/import" className="btn">Turn notes into flashcards</Link>
        </div>
      </section>
    );
  }

  const exams = decks.flatMap((d) => {
    if (!d.exam_date) return [];
    const date = parseDay(d.exam_date, zone);
    const days = daysUntil(date, now, zone);
    return days < 0 ? [] : [{ deck: d, date, days, ready: Math.round(readiness(cards.filter((c) => c.deckId === d.id), date) * 100) }];
  }).sort((a, b) => a.days - b.days);
  // Spec §8.3 order: reviews, essays with open priorities, exams. Essays have no deadline yet, so due reviews stay primary.
  const { queue, estMinutes } = buildSession(cards, { now, minutes, newIntroducedToday, examDate: exams.find((e) => e.days > 0)?.date ?? null, zone, newLimit });
  const next = nextReview(cards, now, zone);
  // B7: new cards beyond today's limit (not the minutes cap) start on later days; say so, and why.
  const limit = newLimit ?? NEW_CARD_LIMIT;
  const later = cards.filter((c) => !c.state).length - Math.max(0, limit - newIntroducedToday);
  const limitNote = `${later} more new ${later === 1 ? 'card starts' : 'cards start'} on later days. Up to ${limit} new cards a day keeps your reviews manageable.`;
  const noExam = decks.filter((d) => !exams.some((e) => e.deck.id === d.id));
  const essayFirst = !queue.length && essays.length > 0;
  const essayLines = essayFirst ? essays.slice(1) : essays;
  const priorities = (n: number) => `${n} of 3 priorities open`;

  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(now);
  // Side B has no estimate of its own: it gets what review leaves of the daily minutes, labelled as left, not as a forecast.
  const reviewMin = queue.length ? Math.min(estMinutes, minutes) : 0;
  const writeMin = essays.length ? Math.max(0, minutes - reviewMin) : 0;
  const pct = (m: number) => (minutes > 0 ? `${Math.round((m / minutes) * 100)}%` : '0%');

  return (
    <div className="space-y-8">
      {/* Today as a J-card: side A review, side B writing, the tape at the foot timed against the daily minutes. */}
      <section aria-label={`Today's plan, ${day}`} className="inlay overflow-hidden [overflow-wrap:anywhere]">
        <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-ink bg-surface px-5 py-2">
          <p className="hand text-xl">{day}</p>
          <p className="flex items-center gap-3 text-sm text-ink-muted">{minutes} min a day <span className="stripe" aria-hidden="true" /></p>
        </div>

        {cards.length > 0 && <div className="px-5 pt-4 pb-5">
          <h2 id="reviews-h" className="hand flex items-baseline gap-3 text-2xl"><span aria-hidden="true" className="stamp text-accent">A</span><span className="underline decoration-[1.5px] underline-offset-4">Reviews</span></h2>
          {queue.length ? (
            <>
              <p className="ruled mt-2 flex items-baseline justify-between gap-4 pb-1 text-[1.2rem]"><span>{plural(queue.length, 'card')}</span><span className="font-bold tabular-nums">~{estMinutes} min</span></p>
              {later > 0 && (
                <p className="mt-1 text-ink-muted">{limitNote}</p>
              )}
              <Link href="/study/review" className="btn btn-primary mt-4 w-full sm:w-auto">Start review</Link>
            </>
          ) : (
            <p className="mt-2">
              You&apos;re all caught up.{next && ` Next review: ${next.label}, about ${plural(next.count, 'card')}.`}
            </p>
          )}
          {!queue.length && later > 0 && <p className="mt-1 text-ink-muted">{limitNote}</p>}
        </div>}

        {essays.length > 0 && <div className={`px-5 pt-4 pb-5 ${cards.length > 0 ? 'border-t-[1.5px] border-ink' : ''}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="essays-h" className="hand flex items-baseline gap-3 text-2xl"><span aria-hidden="true" className="stamp stamp-b text-accent">B</span><span className="underline decoration-[1.5px] underline-offset-4">Essays</span></h2>
            {minutes > 0 && <p className="text-sm font-bold tabular-nums">~{writeMin} min left</p>}
          </div>
          {essayFirst && (
            <div className="mt-2">
              <p className="text-[1.2rem] font-bold">{essays[0].title}</p>
              <p>{priorities(essays[0].openTop3)}</p>
              <Link href={`/write/${essays[0].id}`} className="btn btn-primary mt-4 w-full sm:w-auto">Keep revising</Link>
            </div>
          )}
          {essayLines.length > 0 && (
            <ul className="mt-2">
              {essayLines.map((e) => (
                <li key={e.id} className="ruled flex min-h-11 items-center py-1">
                  <Link href={`/write/${e.id}`} className="underline">{e.title} · {priorities(e.openTop3)}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>}

        {(reviewMin > 0 || writeMin > 0) && minutes > 0 && (
          <div className="border-t-[1.5px] border-ink px-5 py-3">
            <p className="flex justify-between gap-4 text-sm"><span>Today&apos;s tape</span>
              <span className="font-bold tabular-nums">{[reviewMin > 0 && `A ~${reviewMin}`, writeMin > 0 && `B ~${writeMin}`].filter(Boolean).join(' · ')} of {minutes} min</span></p>
            {/* The tape: side A solid ink, side B hatched. The sentence above carries the same facts. */}
            <div aria-hidden="true" className="tape-deck mt-2 flex items-center gap-2">
              <Reel />
              <div className="flex h-2.5 flex-1 border border-ink">
                {reviewMin > 0 && <div className="tape-fill h-full bg-ink" style={{ width: pct(reviewMin) }} />}
                {writeMin > 0 && <div className="tape-fill-b h-full bg-[repeating-linear-gradient(135deg,var(--ink)_0_1.5px,transparent_1.5px_5px)]" style={{ width: pct(writeMin) }} />}
              </div>
              <Reel />
            </div>
          </div>
        )}
      </section>

      {decks.length > 0 && <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="hand mb-2 text-2xl">Exams</h2>
        <ul className="border-t-[1.5px] border-ink">
          {exams.map((e) => (
            <li key={e.deck.id} className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line py-2 [overflow-wrap:anywhere]">
              <span>{e.deck.title} exam {when(e.days)} · {e.ready}% ready</span>
              <Link href={`/study/deck/${e.deck.id}/exam`} className="underline" aria-label={`Change ${e.deck.title} exam date`}>Change</Link>
            </li>
          ))}
          {noExam.map((d) => (
            <li key={d.id} className="flex min-h-12 items-center border-b border-line py-2 [overflow-wrap:anywhere]">
              <Link href={`/study/deck/${d.id}/exam`} className="underline">Set an exam date for {d.title}</Link>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  );
}
