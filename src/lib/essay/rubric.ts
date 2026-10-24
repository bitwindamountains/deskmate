import { z } from 'zod';
import { DEFAULT_RUBRIC, type RubricCriterion } from '@/llm/prompts';

// A2.1: a student's own rubric. Every criterion is scored 1-4 and weighs the same, like the default rubric.
const SHAPE = 'Write 2 to 8 criteria, one per line, like "Evidence: uses specific sources". Each name can be up to 60 characters.';
const Stored = z.array(z.object({ name: z.string().min(1).max(60), description: z.string().max(300), weight: z.literal(1), maxScore: z.literal(4) }))
  .min(2).max(8).refine((cs) => new Set(cs.map((c) => c.name.toLowerCase())).size === cs.length);

/** "Name: description" per line (":", " - " or "—" separate them). Empty text means the default rubric (null). */
export function parseRubric(text: string): { ok: true; rubric: RubricCriterion[] | null } | { ok: false; error: string } {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return { ok: true, rubric: null };
  const rubric = lines.map((l) => {
    const m = l.match(/^(.+?)\s*(?::|\s-\s|—|–)\s*(.*)$/);
    return { name: (m ? m[1] : l).trim(), description: (m ? m[2] : '').trim().slice(0, 300), weight: 1, maxScore: 4 };
  });
  if (rubric.length < 2 || rubric.length > 8 || rubric.some((c) => !c.name || c.name.length > 60)) return { ok: false, error: SHAPE };
  if (new Set(rubric.map((c) => c.name.toLowerCase())).size !== rubric.length) return { ok: false, error: 'Each criterion needs its own name.' };
  return { ok: true, rubric };
}

/** The rubric an essay is scored on. Re-checked on read: `essays.rubric` can be written through the API directly. */
export function rubricOf(stored: unknown): RubricCriterion[] {
  const r = Stored.safeParse(stored);
  return r.success ? r.data : DEFAULT_RUBRIC;
}

/**
 * Keeps only scores for the rubric's own criteria, renamed to its exact names (the model may change case), clamped to 1..max.
 * The self-check and draft compare match scores by name, so a stray or renamed criterion would never line up.
 */
export function matchScores<T extends { criterion: string; score: number }>(scores: T[], rubric: RubricCriterion[]): T[] {
  const byKey = new Map(rubric.map((c) => [c.name.toLowerCase(), c]));
  return scores.flatMap((s) => {
    const c = byKey.get(s.criterion.trim().toLowerCase());
    return c ? [{ ...s, criterion: c.name, score: Math.min(c.maxScore, Math.max(1, Math.round(s.score))) }] : [];
  });
}
