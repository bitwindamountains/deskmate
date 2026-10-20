import type { FeedbackItem } from './llm/schemas.js';

export type RankedItem<T> = T & { priority_rank: number; priority_score: number };

const LAYER_WEIGHT = { global: 3, paragraph: 2, sentence: 1 } as const;
const SEVERITY = { low: 1, medium: 2, high: 3 } as const;

/** score = layer_weight × rubric_weight × severity × (1 + 0.25 × repeat_count); computed in code so ranks are stable across runs. */
export function rankFeedback<T extends Pick<FeedbackItem, 'layer' | 'severity' | 'category' | 'rubric_criterion'>>(
  items: T[],
  rubricWeights: Record<string, number> = {},
): RankedItem<T>[] {
  const perCategory = new Map<string, number>();
  for (const it of items) perCategory.set(it.category, (perCategory.get(it.category) ?? 0) + 1);
  return items
    .map((it) => ({
      ...it,
      priority_score:
        LAYER_WEIGHT[it.layer] *
        (rubricWeights[it.rubric_criterion] ?? 1) *
        SEVERITY[it.severity] *
        (1 + 0.25 * (perCategory.get(it.category)! - 1)),
    }))
    .sort((a, b) => b.priority_score - a.priority_score) // Array.prototype.sort is stable: ties keep input order
    .map((it, i) => ({ ...it, priority_rank: i + 1 }));
}
