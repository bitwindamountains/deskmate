import { Rating } from 'ts-fsrs';
import type { EmbedFn } from '@/lib/embed/embed';
import { cosine } from '@/lib/embed/duplicates';
import type { Grade } from './schedule';
import { EXPLAIN_TYPES, type CardType } from '@/lib/cards/types';

export function normalizeAnswer(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]/gu, (c, i, str) => (/[.,\-+%/]/.test(c) && !(/[.,]/.test(c) && /^\s*$/.test(str[i + 1] ?? '')) && (/\d/.test(str[i - 1] ?? '') || /\d/.test(str[i + 1] ?? '')) ? c : ''))
    .split(/\s+/).filter((w) => w && w !== 'a' && w !== 'an' && w !== 'the').join(' ');
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const x = normalizeAnswer(a), y = normalizeAnswer(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

export function scoreToRating(score: number, responseMs: number): Grade {
  if (score < 0.4) return Rating.Again;
  if (score < 0.7) return Rating.Hard;
  return score >= 0.9 && responseMs <= 10000 ? Rating.Easy : Rating.Good;
}

export interface CascadeInput { type: CardType; reference: string; keyPoints: string[]; answer: string; responseMs: number }
export interface CascadeResult { score: number; source: 'exact' | 'fuzzy' | 'embedding'; hit: string[]; missed: string[]; suggested: Grade; needsLlm: boolean }

const KP_HIT = 0.75;

export async function gradeLocally(i: CascadeInput, embed: EmbedFn | null): Promise<CascadeResult> {
  const done = (score: number, source: CascadeResult['source'], hit: string[], missed: string[], settled: boolean): CascadeResult => ({
    score, source, hit, missed, suggested: scoreToRating(score, i.responseMs),
    needsLlm: !settled && (EXPLAIN_TYPES.includes(i.type) || (score >= 0.45 && score <= 0.85)),
  });
  const ans = normalizeAnswer(i.answer);
  if (!ans) return { ...done(0, 'fuzzy', [], i.keyPoints, true), needsLlm: false };
  if (ans === normalizeAnswer(i.reference)) return done(1, 'exact', i.keyPoints, [], true);
  const sim = similarity(ans, i.reference);
  if (i.reference.trim().split(/\s+/).length <= 8 && sim >= 0.85) return done(sim, 'fuzzy', i.keyPoints, [], true);
  if (!embed) return done(sim, 'fuzzy', [], i.keyPoints, false);
  let v: number[][];
  try { v = await embed([i.answer, i.reference, ...i.keyPoints]); } catch { return done(sim, 'fuzzy', [], i.keyPoints, false); }
  if (!i.keyPoints.length) return done(Math.min(1, Math.max(0, cosine(v[0], v[1]))), 'embedding', [], [], false);
  const hit = i.keyPoints.filter((_, k) => cosine(v[0], v[2 + k]) >= KP_HIT);
  return done(hit.length / i.keyPoints.length, 'embedding', hit, i.keyPoints.filter((k) => !hit.includes(k)), false);
}
