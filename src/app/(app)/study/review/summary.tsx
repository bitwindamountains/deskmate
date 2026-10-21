import { Rating } from 'ts-fsrs';
import type { Grade, StudyCard } from '@/review/schedule';

const DAY_MS = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The earliest upcoming review day and how many cards fall due by the end of it. */
export function nextReview(cards: StudyCard[], now: Date): { label: string; count: number } | null {
  const dues = cards.flatMap((c) => (c.state ? [new Date(c.state.due)] : []));
  if (!dues.length) return null;
  const first = new Date(Math.min(...dues.map((d) => d.getTime())));
  const day = first < now ? startOfDay(now) : startOfDay(first);
  const end = day.getTime() + DAY_MS;
  const days = Math.round((day.getTime() - startOfDay(now).getTime()) / DAY_MS);
  const label = days === 0 ? 'today' : days === 1 ? 'tomorrow'
    : days < 7 ? day.toLocaleDateString('en', { weekday: 'long' }) : day.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return { label, count: dues.filter((d) => d.getTime() < end).length };
}

export function Summary({ ratings, ms, cards, onDoMore, nothingMore }:
  { ratings: Grade[]; ms: number; cards: StudyCard[]; onDoMore: () => void; nothingMore: boolean }) {
  const good = ratings.filter((r) => r === Rating.Good || r === Rating.Easy).length;
  const mins = Math.round(ms / 60000);
  const next = nextReview(cards, new Date());
  return (
    <section aria-labelledby="summary-h" className="max-w-prose space-y-4 rounded-xl border border-line bg-surface p-6">
      <h2 id="summary-h" className="text-xl font-bold text-balance">Session done</h2>
      <ul className="space-y-1">
        <li>{ratings.length} {ratings.length === 1 ? 'card' : 'cards'} reviewed</li>
        <li>Accuracy: {Math.round((good / ratings.length) * 100)}%</li>
        <li>Time: {mins < 1 ? 'under a minute' : `${mins} min`}</li>
        {next && <li>Next review: {next.label}, about {next.count} {next.count === 1 ? 'card' : 'cards'}</li>}
      </ul>
      {next && <p>Nice work. Your next review is ready {next.label}.</p>}
      {nothingMore && <p role="status" className="text-ink-muted">Nothing more to review right now.</p>}
      <button type="button" className="btn" onClick={onDoMore}>Do more</button>
    </section>
  );
}
