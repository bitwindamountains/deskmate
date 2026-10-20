import { expect, test } from 'vitest';
import { Card, EssayGlobal, FeedbackItem, GradeAnswer } from '../../src/llm/schemas.js';

const item = {
  layer: 'global', category: 'thesis', rubric_criterion: 'Thesis', paragraph_index: 0,
  quote: 'x', severity: 'high', summary: 's', hints: ['q', 'h'],
};
const strength = { paragraph_index: 0, quote: 'x', why: 'w' };

test('GradeAnswer rejects score 1.2 and accepts misconception null', () => {
  const g = { score: 0.5, hit: [], missed: [], misconception: null, feedback: 'f', suggested_rating: 'hard' };
  expect(GradeAnswer.safeParse(g).success).toBe(true);
  expect(GradeAnswer.safeParse({ ...g, score: 1.2 }).success).toBe(false);
});

test('FeedbackItem rejects empty quote and a hints array of length 1', () => {
  expect(FeedbackItem.safeParse(item).success).toBe(true);
  expect(FeedbackItem.safeParse({ ...item, quote: '' }).success).toBe(false);
  expect(FeedbackItem.safeParse({ ...item, hints: ['q'] }).success).toBe(false);
});

test('EssayGlobal rejects 1 strength and 4 strengths', () => {
  const g = { strengths: [strength, strength], rubric_scores: [], items: [item] };
  expect(EssayGlobal.safeParse(g).success).toBe(true);
  expect(EssayGlobal.safeParse({ ...g, strengths: [strength] }).success).toBe(false);
  expect(EssayGlobal.safeParse({ ...g, strengths: [strength, strength, strength, strength] }).success).toBe(false);
});

test('Card requires importance 1..3', () => {
  const c = { type: 'basic', front: 'f', back: 'b', key_points: [], source_quote: 'q', concept: 'c', bloom_level: 'remember' };
  for (const importance of [1, 2, 3]) expect(Card.safeParse({ ...c, importance }).success).toBe(true);
  for (const importance of [0, 4, 1.5, '2', undefined]) expect(Card.safeParse({ ...c, importance }).success).toBe(false);
});
