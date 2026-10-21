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
    <section aria-labelledby="summary-h" className="max-w-prose space-y-4 rounded-xl border border-line bg-surface p-6">
      <h2 id="summary-h" className="text-xl font-bold text-balance">Session done</h2>
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
