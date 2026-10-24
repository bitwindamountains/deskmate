import { expect, test } from 'vitest';
import { matchScores, parseRubric, rubricOf } from '@/lib/essay/rubric';
import { DEFAULT_RUBRIC } from '@/llm/prompts';

test('one criterion per line, "Name: what it looks for"; bullets and numbers are stripped (A2.1)', () => {
  const r = parseRubric('- Thesis: takes a clear position\n2. Evidence — cites at least two sources\n\n* Style');
  expect(r).toEqual({ ok: true, rubric: [
    { name: 'Thesis', description: 'takes a clear position', weight: 1, maxScore: 4 },
    { name: 'Evidence', description: 'cites at least two sources', weight: 1, maxScore: 4 },
    { name: 'Style', description: '', weight: 1, maxScore: 4 },
  ] });
});

test('an empty rubric means the default; too few, too many or repeated criteria are refused with a plain message', () => {
  expect(parseRubric('   \n ')).toEqual({ ok: true, rubric: null });
  const msg = { ok: false, error: 'Write 2 to 8 criteria, one per line, like "Evidence: uses specific sources". Each name can be up to 60 characters.' };
  expect(parseRubric('Only one: line')).toEqual(msg);
  expect(parseRubric(Array.from({ length: 9 }, (_, i) => `C${i}: x`).join('\n'))).toEqual(msg);
  expect(parseRubric(`${'N'.repeat(61)}: x\nOther: y`)).toEqual(msg);
  expect(parseRubric('Evidence: a\nevidence: b')).toEqual({ ok: false, error: 'Each criterion needs its own name.' });
});

test('a stored rubric is re-checked on read; anything malformed falls back to the default', () => {
  const ok = parseRubric('Thesis: a\nEvidence: b');
  expect(rubricOf(ok.ok ? ok.rubric : null)).toHaveLength(2);
  expect(rubricOf(null)).toBe(DEFAULT_RUBRIC);
  expect(rubricOf([{ name: 'X', description: '', weight: 1, maxScore: 100 }, { name: 'Y', description: '', weight: 1, maxScore: 4 }])).toBe(DEFAULT_RUBRIC);
});

test("model scores are matched to the rubric's own names, case-insensitively; unknown criteria are dropped and scores clamped", () => {
  const rubric = [{ name: 'Use of sources', description: '', weight: 1, maxScore: 4 }, { name: 'Voice', description: '', weight: 1, maxScore: 4 }];
  const scores = [
    { criterion: 'use of Sources', score: 3, justification: 'j', confidence: 'high' as const },
    { criterion: 'Grammar', score: 2, justification: 'j', confidence: 'low' as const },
    { criterion: 'Voice', score: 9, justification: 'j', confidence: 'medium' as const },
  ];
  expect(matchScores(scores, rubric).map((s) => [s.criterion, s.score])).toEqual([['Use of sources', 3], ['Voice', 4]]);
});
