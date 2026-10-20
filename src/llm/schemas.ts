import { z } from 'zod';

export const FeedbackItem = z.object({
  layer: z.enum(['global', 'paragraph', 'sentence']),
  category: z.string(),
  rubric_criterion: z.string(),
  paragraph_index: z.number().int().min(0),
  /** Exact text from the essay; code computes offsets from it. */
  quote: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
  /** Hint ladder levels 1 (guiding question) and 2 (hint); levels 3+ are generated on request. */
  hints: z.tuple([z.string(), z.string()]),
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;

export const EssayGlobal = z.object({
  strengths: z
    .array(z.object({ paragraph_index: z.number().int().min(0), quote: z.string().min(1), why: z.string() }))
    .min(2)
    .max(3),
  rubric_scores: z.array(
    z.object({
      criterion: z.string(),
      score: z.number().int(),
      justification: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  items: z.array(FeedbackItem),
});
export type EssayGlobal = z.infer<typeof EssayGlobal>;

export const EssayParagraphs = z.object({ items: z.array(FeedbackItem) });
export type EssayParagraphs = z.infer<typeof EssayParagraphs>;

export const Card = z.object({
  type: z.enum(['basic', 'cloze', 'why']),
  front: z.string(),
  back: z.string(),
  key_points: z.array(z.string()),
  source_quote: z.string(),
  concept: z.string(),
  bloom_level: z.enum(['remember', 'understand', 'apply', 'analyze']),
});
export type Card = z.infer<typeof Card>;

export const CardGenerate = z.object({ cards: z.array(Card) });
export type CardGenerate = z.infer<typeof CardGenerate>;

export const GradeAnswer = z.object({
  score: z.number().min(0).max(1),
  hit: z.array(z.string()),
  missed: z.array(z.string()),
  misconception: z.string().nullable(),
  feedback: z.string(),
  suggested_rating: z.enum(['again', 'hard', 'good', 'easy']),
});
export type GradeAnswer = z.infer<typeof GradeAnswer>;
