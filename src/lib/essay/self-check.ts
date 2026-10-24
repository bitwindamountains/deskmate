import { z } from 'zod';
import { DEFAULT_RUBRIC, type RubricCriterion } from '@/llm/prompts';

export type SelfScore = { criterion: string; score: number };
export type SelfAssessment = { scores: SelfScore[]; weakness: string | null };

// Scores must name a criterion of the essay's rubric (A2.1: the student's own, or the default).
const inputFor = (rubric: RubricCriterion[]) => {
  const max = new Map(rubric.map((c) => [c.name, c.maxScore]));
  return z.object({
    scores: z.array(z.object({ criterion: z.string(), score: z.number().int() })
      .refine((s) => max.has(s.criterion) && s.score >= 1 && s.score <= max.get(s.criterion)!)).max(rubric.length),
    weakness: z.string().trim().max(300).nullable().transform((s) => s || null),
  });
};

/** Trust boundary for the optional self-rating (A3.7). An untouched form is { ok: true, value: null }: nothing to save. */
export function parseSelfAssessment(input: unknown, rubric: RubricCriterion[] = DEFAULT_RUBRIC): { ok: true; value: SelfAssessment | null } | { ok: false } {
  if (input === undefined || input === null) return { ok: true, value: null };
  const r = inputFor(rubric).safeParse(input);
  if (!r.success) return { ok: false };
  return { ok: true, value: r.data.scores.length || r.data.weakness ? r.data : null };
}

/** Side-by-side scores; "within one point" counts only criteria both sides scored. */
export function compareSelf(self: SelfScore[], ai: SelfScore[]):
  { rows: { criterion: string; self: number | null; ai: number | null }[]; within: number; of: number } {
  const names = [...new Set([...self.map((s) => s.criterion), ...ai.map((s) => s.criterion)])];
  const rows = names.map((criterion) => ({ criterion, self: self.find((s) => s.criterion === criterion)?.score ?? null,
    ai: ai.find((s) => s.criterion === criterion)?.score ?? null }));
  const both = rows.filter((r) => r.self !== null && r.ai !== null);
  return { rows, within: both.filter((r) => Math.abs(r.self! - r.ai!) <= 1).length, of: both.length };
}
