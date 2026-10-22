import { PATTERNS, type PatternKey } from './patterns';

export type EssayItems = { essayId: string; title: string; createdAt: string; words: number; patterns: PatternKey[] };
export type PatternStat = { key: PatternKey; label: string; essays: number; latestRate: number; trend: number | null };

const ORDER = Object.keys(PATTERNS) as PatternKey[];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Recurring patterns across first drafts (A3.5). Rates are per 1,000 words; essays are oldest first. */
export function growthProfile(essays: EssayItems[]): { recurring: PatternStat[]; essays: number } {
  const rate = (e: EssayItems, key: PatternKey) => (1000 * e.patterns.filter((p) => p === key).length) / Math.max(e.words, 1);
  const first = essays[0];
  const latest = essays.at(-1);
  const recurring = ORDER.flatMap((key) => {
    const seen = essays.filter((e) => e.patterns.includes(key)).length;
    if (seen < 2 || !first || !latest) return [];
    const from = rate(first, key);
    const to = rate(latest, key);
    return [{ key, label: PATTERNS[key], essays: seen, latestRate: round1(to), trend: from > 0 ? (to - from) / from : null }];
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
