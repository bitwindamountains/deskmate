import { PATTERNS, type PatternKey } from './patterns';

export type EssayItems = { essayId: string; title: string; createdAt: string; words: number; patterns: PatternKey[] };
export type PatternStat = { key: PatternKey; label: string; essays: number; latestRate: number; trend: number | null };

const ORDER = Object.keys(PATTERNS) as PatternKey[];
// A one-paragraph answer (C1 writing tasks are 50+ words) swings a per-1,000-word rate wildly, so trend endpoints skip short ones.
const TREND_MIN_WORDS = 250;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Recurring patterns across first drafts (A3.5). Rates are per 1,000 words; essays are oldest first. */
export function growthProfile(essays: EssayItems[]): { recurring: PatternStat[]; essays: number } {
  const rate = (e: EssayItems, key: PatternKey) => (1000 * e.patterns.filter((p) => p === key).length) / Math.max(e.words, 1);
  const long = essays.filter((e) => e.words >= TREND_MIN_WORDS);
  const first = long[0];
  const latest = long.at(-1);
  const recurring = ORDER.flatMap((key) => {
    const seen = essays.filter((e) => e.patterns.includes(key)).length;
    if (seen < 2) return [];
    const from = first ? rate(first, key) : 0;
    const to = latest ? rate(latest, key) : 0;
    const trend = first && latest && first !== latest && from > 0 ? (to - from) / from : null;
    return [{ key, label: PATTERNS[key], essays: seen, latestRate: round1(to), trend }];
  });
  // Stable sort: ties keep the display order.
  recurring.sort((a, b) => b.essays - a.essays || b.latestRate - a.latestRate);
  return { recurring, essays: essays.length };
}

/** "Down 60% since your first essay"; changes within ±10% read as about the same. Never guilt framing. */
export function trendCopy(trend: number | null): string | null {
  if (trend === null) return null;
  const pct = Math.round(Math.abs(trend) * 100);
  if (pct <= 10) return 'About the same as your first essay';
  return `${trend < 0 ? 'Down' : 'Up'} ${pct}% since your first essay`;
}
