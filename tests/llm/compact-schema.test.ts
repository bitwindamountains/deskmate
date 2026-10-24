import { expect, test } from 'vitest';
import { z } from 'zod';
import { cardGeneratePrompt, cardImprovePrompt, compactSchema, essayGlobalPrompt, essayParagraphsPrompt, gradeAnswerPrompt, hintLadderPrompt, hintRewritePrompt } from '@/llm/prompts';
import { CardGenerate, CardImprove, EssayGlobal, EssayParagraphs, GradeAnswer, HintLadder, HintRewrite } from '@/llm/schemas';

test('compactSchema prints the GradeAnswer contract as one short line', () => {
  expect(compactSchema(GradeAnswer)).toBe(
    '{"score": number 0..1, "hit": string[], "missed": string[], "misconception": string | null, "feedback": string, "suggested_rating": "again" | "hard" | "good" | "easy"}',
  );
});

test('compactSchema keeps tuples, array lengths, literal unions, optional fields, and min lengths', () => {
  const s = z.object({
    hints: z.tuple([z.string(), z.string()]),
    strengths: z.array(z.object({ quote: z.string().min(1) })).min(2).max(3),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    carried: z.array(z.string()).default([]),
    note: z.string().optional(),
    index: z.number().int().min(0),
    score: z.number().int(),
  });
  expect(compactSchema(s)).toBe(
    '{"hints": [string, string], "strengths": {"quote": non-empty string}[] (2-3 items), "importance": 1 | 2 | 3, "carried"?: string[], "note"?: string, "index": integer >=0, "score": integer}',
  );
});

test('compact schemas are under half the size of the JSON Schema for every task', () => {
  for (const s of [EssayGlobal, EssayParagraphs, CardGenerate, GradeAnswer, HintLadder] as z.ZodType[]) {
    const full = JSON.stringify(z.toJSONSchema(s)).length;
    expect(compactSchema(s).length).toBeLessThan(full / 2);
  }
});

test('every prompt states its output as the compact shape, never the raw JSON Schema', () => {
  const essay = { essay: 'A.\n\nB.', gradeLevel: 'college', essayType: 'argumentative' };
  const hint = { gradeLevel: 'college', item: { summary: 's', quote: 'q', category: 'c' }, paragraph: 'p' };
  const cases: [string, z.ZodType][] = [
    [essayGlobalPrompt({ ...essay, assignmentPrompt: 'Argue.' }).system, EssayGlobal],
    [essayGlobalPrompt(essay).system, EssayGlobal.omit({ prompt_alignment: true })], [essayParagraphsPrompt(essay).system, EssayParagraphs],
    [hintLadderPrompt(hint).system, HintLadder], [hintRewritePrompt(hint).system, HintRewrite],
    [cardGeneratePrompt({ chunk: 'c', subject: 's', level: 'l' }).system, CardGenerate],
    [cardImprovePrompt({ type: 'basic', front: 'f', back: 'b', chunk: 'c' }).system, CardImprove],
    [gradeAnswerPrompt({ question: 'q', reference: 'r', keyPoints: [], answer: 'a' }).system, GradeAnswer],
  ];
  for (const [system, schema] of cases) {
    expect(system).toContain(`Return only JSON with this shape: ${compactSchema(schema)}`);
    expect(system).not.toContain('$schema');
  }
});
