import { expect, test } from 'vitest';
import { compareSelf, parseSelfAssessment } from '@/lib/essay/self-check';

test('compareSelf counts criteria within one point and ignores criteria only one side scored', () => {
  const r = compareSelf(
    [{ criterion: 'Thesis', score: 4 }, { criterion: 'Evidence', score: 1 }, { criterion: 'Analysis', score: 3 }],
    [{ criterion: 'Thesis', score: 3 }, { criterion: 'Evidence', score: 3 }, { criterion: 'Conventions', score: 2 }],
  );
  expect(r.rows).toEqual([
    { criterion: 'Thesis', self: 4, ai: 3 },
    { criterion: 'Evidence', self: 1, ai: 3 },
    { criterion: 'Analysis', self: 3, ai: null },
    { criterion: 'Conventions', self: null, ai: 2 },
  ]);
  expect(r).toMatchObject({ within: 1, of: 2 });
});

test('parseSelfAssessment keeps only known criteria with whole scores in range; empty means nothing to save', () => {
  expect(parseSelfAssessment({ scores: [{ criterion: 'Thesis', score: 3 }], weakness: '  Evidence  ' }))
    .toEqual({ ok: true, value: { scores: [{ criterion: 'Thesis', score: 3 }], weakness: 'Evidence' } });
  expect(parseSelfAssessment({ scores: [], weakness: ' ' })).toEqual({ ok: true, value: null });
  expect(parseSelfAssessment(undefined)).toEqual({ ok: true, value: null });
  for (const bad of [{ criterion: 'Thesis', score: 5 }, { criterion: 'Thesis', score: 0 }, { criterion: 'Thesis', score: 2.5 }, { criterion: 'Vibes', score: 2 }]) {
    expect(parseSelfAssessment({ scores: [bad], weakness: null }).ok).toBe(false);
  }
  expect(parseSelfAssessment({ scores: [], weakness: 'x'.repeat(301) }).ok).toBe(false);
});
