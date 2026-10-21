import { expect, test } from 'vitest';
import { parseOnboarding } from '@/lib/profile/onboarding';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { adult: 'on', first_language: 'fil', study_minutes_per_day: '20', font: 'default' };

test('missing 18+ box gives the adult error and no value', () => {
  const { adult: _a, ...rest } = ok;
  expect(parseOnboarding(fd(rest))).toEqual({ ok: false, errors: { adult: "Scholar's beta is for adults (18+) for now." } });
});
test('empty language is a field error', () => {
  const r = parseOnboarding(fd({ ...ok, first_language: '' }));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(Object.keys(r.errors)).toEqual(['first_language']);
});
test('"Other" without text is an error', () => {
  const r = parseOnboarding(fd({ ...ok, first_language: 'other', first_language_other: '  ' }));
  expect(r.ok).toBe(false);
});
test('"Other" uses the free-text value', () => {
  const r = parseOnboarding(fd({ ...ok, first_language: 'other', first_language_other: 'Ilocano' }));
  expect(r).toMatchObject({ ok: true, value: { first_language: 'Ilocano' } });
});
test.each(['3', '200', 'abc'])('study minutes %s rejected', (m) => {
  const r = parseOnboarding(fd({ ...ok, study_minutes_per_day: m }));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors).toHaveProperty('study_minutes_per_day');
});
test('valid input parses with defaults', () => {
  const r = parseOnboarding(fd({ adult: 'on', first_language: 'en' }));
  expect(r).toEqual({ ok: true, value: { adult: true, first_language: 'en', study_minutes_per_day: 20, font: 'default', reduced_motion: false, show_scores: false } });
});
test('dyslexic font and reduce motion', () => {
  const r = parseOnboarding(fd({ ...ok, font: 'dyslexic', reduced_motion: 'on' }));
  expect(r).toMatchObject({ ok: true, value: { font: 'dyslexic', reduced_motion: true } });
});
test('show rubric scores', () => {
  expect(parseOnboarding(fd({ ...ok, show_scores: 'on' }))).toMatchObject({ ok: true, value: { show_scores: true } });
});
