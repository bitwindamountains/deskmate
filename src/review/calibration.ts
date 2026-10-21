import { Rating } from 'ts-fsrs';

/** Guessing 1, Unsure 2, Confident 3 (brief B3.2). */
export type Confidence = 1 | 2 | 3;
/** How often each level "should" be right; a well-calibrated student's accuracy matches these. */
export const EXPECTED: Record<Confidence, number> = { 1: 0.33, 2: 0.6, 3: 0.9 };
const MIN_ROWS = 10; // fewer answers say more about luck than calibration

/** Self-check accuracy: 100 × (1 − mean |expected − correct|), where correct is a final rating of Good or Easy. */
export function calibration(rows: { confidence: Confidence; final_rating: number }[]): { score: number; n: number } | null {
  if (rows.length < MIN_ROWS) return null;
  const gap = rows.reduce((sum, r) => sum + Math.abs(EXPECTED[r.confidence] - (r.final_rating >= Rating.Good ? 1 : 0)), 0) / rows.length;
  return { score: Math.round(100 * (1 - gap)), n: rows.length };
}
