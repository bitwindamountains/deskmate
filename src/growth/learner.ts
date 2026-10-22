import { compareSelf, type SelfScore } from '@/lib/essay/self-check';

const MIN_CRITERIA = 3; // fewer compared criteria say more about luck than calibration
const LEECH_LAPSES = 4; // brief B3.3, same as the review session

/** Essay self-assessment accuracy across drafts: criteria the student scored within one point of the coach. */
export function writingCalibration(drafts: { self: SelfScore[]; ai: SelfScore[] }[]): { within: number; of: number } | null {
  if (!drafts.length) return null;
  return drafts.reduce((t, d) => {
    const c = compareSelf(d.self, d.ai);
    return { within: t.within + c.within, of: t.of + c.of };
  }, { within: 0, of: 0 });
}

/** One calibration score across both tools (C2): each part on its own, and combined (weighted by counts) only when both exist. */
export function sharedCalibration(recall: { score: number; n: number } | null, writing: { within: number; of: number } | null):
  { recall: number | null; writing: number | null; combined: number | null } {
  const w = writing && writing.of >= MIN_CRITERIA ? { score: (100 * writing.within) / writing.of, n: writing.of } : null;
  return {
    recall: recall?.score ?? null,
    writing: w ? Math.round(w.score) : null,
    combined: recall && w ? Math.round((recall.score * recall.n + w.score * w.n) / (recall.n + w.n)) : null,
  };
}

/** Mean deepest hint level over the items the student opened at all, one decimal. */
export function hintReliance(levels: number[]): number | null {
  const opened = levels.filter((l) => l >= 1);
  return opened.length ? Math.round((10 * opened.reduce((a, b) => a + b, 0)) / opened.length) / 10 : null;
}

/** Share of studied cards that are leeches, whole percent. */
export function leechRate(lapses: number[]): number | null {
  return lapses.length ? Math.round((100 * lapses.filter((l) => l >= LEECH_LAPSES).length) / lapses.length) : null;
}
