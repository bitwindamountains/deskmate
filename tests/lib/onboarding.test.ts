import { expect, test } from 'vitest';
import { parseOnboarding } from '@/lib/profile/onboarding';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { adult: 'on', study_minutes_per_day: '20', font: 'default' };

test('missing 18+ box gives the adult error and no value', () => {
  const { adult: _a, ...rest } = ok;
  expect(parseOnboarding(fd(rest))).toEqual({ ok: false, errors: { adult: "Deskmate's beta is for adults (18+) for now." } });
});
test.each(['3', '200', 'abc'])('study minutes %s rejected', (m) => {
  const r = parseOnboarding(fd({ ...ok, study_minutes_per_day: m }));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors).toHaveProperty('study_minutes_per_day');
});
test('valid input parses with defaults', () => {
  const r = parseOnboarding(fd({ adult: 'on', first_language: 'en' })) // a stale form field is ignored;
  expect(r).toEqual({ ok: true, value: { adult: true, study_minutes_per_day: 20, new_cards_per_day: 20, retention_percent: 90,
    font: 'default', reduced_motion: false, show_scores: false } });
});
test('dyslexic font and reduce motion', () => {
  const r = parseOnboarding(fd({ ...ok, font: 'dyslexic', reduced_motion: 'on' }));
  expect(r).toMatchObject({ ok: true, value: { font: 'dyslexic', reduced_motion: true } });
});
test('show rubric scores', () => {
  expect(parseOnboarding(fd({ ...ok, show_scores: 'on' }))).toMatchObject({ ok: true, value: { show_scores: true } });
});
test('new cards per day and target retention (B2.6)', () => {
  expect(parseOnboarding(fd({ ...ok, new_cards_per_day: '35', retention_percent: '85' })))
    .toMatchObject({ ok: true, value: { new_cards_per_day: 35, retention_percent: 85 } });
});
test.each([['new_cards_per_day', '2'], ['new_cards_per_day', '101'], ['retention_percent', '79'], ['retention_percent', '98'], ['retention_percent', '90.5']])(
  '%s %s rejected', (k, v) => {
    const r = parseOnboarding(fd({ ...ok, [k]: v }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveProperty(k);
  });
