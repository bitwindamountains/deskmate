import { Rating } from 'ts-fsrs';
import { checkBlank, sameAnswer } from '@/review/formats';
import { applyRating, makeScheduler, type StateRow } from '@/review/schedule';

/** Sign-in's try-a-card (owner, 2026-11-27): three short-answer cards from the demo notes, checked on the device. */
export const TRY_CARDS: { front: string; answers: string[]; deck: string }[] = [
  { deck: 'Cell Biology', front: 'Which organelle releases energy from glucose and stores it as ATP?', answers: ['mitochondria', 'mitochondrion'] },
  { deck: 'Cell Biology', front: 'What is the diffusion of water across a selectively permeable membrane called?', answers: ['osmosis'] },
  { deck: 'The Industrial Revolution', front: 'What did James Watt add to the steam engine in 1769?', answers: ['a separate condenser', 'condenser'] },
];

/** Review's own on-device matching: same answer ignoring case, punctuation and filler words, or a near-miss spelling. */
export const isRight = (answer: string, answers: string[]) => !!answer.trim() && answers.some((a) => sameAnswer(answer, a) || checkBlank(answer, a));

/** Gaps between reviews of a new card answered right every time it comes due, from the app's real scheduler. */
export function spacingIfRight(now: Date, steps = 4): number[] {
  const f = makeScheduler(false);
  let state: StateRow | null = null, at = now;
  const gaps: number[] = [];
  for (let i = 0; i < steps; i++) {
    state = applyRating({ id: 'try', deckId: 'try', type: 'basic', importance: 2, state }, Rating.Good, at, null, f).state;
    const due = new Date(state.due);
    gaps.push(due.getTime() - at.getTime());
    at = due;
  }
  return gaps;
}

const DAY = 86_400_000;
export function formatGap(ms: number): string {
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minutes`;
  if (ms < DAY) return `${Math.round(ms / 3_600_000)} hours`;
  const days = Math.round(ms / DAY);
  if (days <= 1) return 'a day';
  if (days < 6) return `about ${days} days`;
  if (days < 11) return 'about a week';
  if (days < 45) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}
