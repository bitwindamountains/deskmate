import { Rating } from 'ts-fsrs';
import { calibration, type Confidence } from '@/review/calibration';
import { nextReview, type Grade, type StudyCard } from '@/review/schedule';

export function Summary({ ratings, confidences = [], concepts, ms, cards, onDoMore, nothingMore }:
  { ratings: Grade[]; confidences?: { confidence: Confidence; final_rating: number }[]; concepts?: { improved: string[]; needsAttention: string[] };
    ms: number; cards: StudyCard[]; onDoMore: () => void; nothingMore: boolean }) {
  const good = ratings.filter((r) => r === Rating.Good || r === Rating.Easy).length;
  const mins = Math.round(ms / 60000);
  const next = nextReview(cards, new Date());
  const selfCheck = calibration(confidences);
  return (
    <section aria-labelledby="summary-h" className="max-w-prose space-y-4 inlay p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="summary-h" className="text-xl font-bold text-balance">Session done</h2>
        <Pile n={ratings.length} />
      </div>
      <ul className="space-y-1">
        <li>{ratings.length} {ratings.length === 1 ? 'card' : 'cards'} reviewed</li>
        <li>Accuracy: {Math.round((good / ratings.length) * 100)}%</li>
        <li>Time: {mins < 1 ? 'under a minute' : `${mins} min`}</li>
        {next && <li>Next review: {next.label}, about {next.count} {next.count === 1 ? 'card' : 'cards'}</li>}
        {selfCheck && <li>Self-check accuracy: {selfCheck.score}%</li>}
        {!!concepts?.improved.length && <li>Got stronger: {concepts.improved.join(', ')}</li>}
        {!!concepts?.needsAttention.length && <li>Needs another look: {concepts.needsAttention.join(', ')}</li>}
      </ul>
      {next && <p>Nice work. Your next review is ready {next.label}.</p>}
      {nothingMore && <p role="status" className="text-ink-muted">Nothing more to review right now.</p>}
      <button type="button" className="btn" onClick={onDoMore}>Do more</button>
    </section>
  );
}

/** The cards just reviewed square up into a pile (up to five drawn), then a pen tick is drawn on top. Decoration only. */
function Pile({ n }: { n: number }) {
  const shown = Math.min(Math.max(n, 1), 5);
  const step = 70;
  return (
    <svg aria-hidden="true" viewBox="0 0 64 52" className="h-12 w-16 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.5">
      <g className="pile">
        {Array.from({ length: shown }, (_, i) => (
          <rect key={i} x={8 - i} y={22 - i * 3} width="48" height="26" rx="2" fill="var(--surface)"
            style={{ '--from-x': `${(i % 2 ? 1 : -1) * (10 + i * 3)}px`, '--from-r': `${(i % 2 ? 1 : -1) * (8 + i * 2)}deg`, animationDelay: `${i * step}ms` } as React.CSSProperties} />
        ))}
      </g>
      <path className="tick" d={`M${20 - shown} ${30 - shown * 3}l7 7 15-16`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ animationDelay: `${shown * step + 380}ms` }} />
    </svg>
  );
}
