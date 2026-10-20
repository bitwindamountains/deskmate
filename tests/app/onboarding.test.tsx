import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); });
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

let claims: { sub: string } | null = { sub: 'u1' };
let profile: Record<string, unknown> | null = null;
const update = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }),
      update: (v: unknown) => ({ eq: (...a: unknown[]) => update(v, ...a) }),
    }),
  }),
}));

import { requireOnboardedUser } from '@/lib/profile/require';
import { completeOnboarding } from '@/app/onboarding/actions';
import { OnboardingForm } from '@/app/onboarding/onboarding-form';

beforeEach(() => { redirect.mockClear(); update.mockReset(); claims = { sub: 'u1' }; });
afterEach(cleanup);

test('no claims redirects to /login', async () => {
  claims = null;
  await expect(requireOnboardedUser()).rejects.toThrow('REDIRECT:/login');
});
test('profile with onboarded_at null redirects to /onboarding', async () => {
  profile = { user_id: 'u1', onboarded_at: null };
  await expect(requireOnboardedUser()).rejects.toThrow('REDIRECT:/onboarding');
});
test('onboarded profile is returned', async () => {
  profile = { user_id: 'u1', onboarded_at: '2026-01-01' };
  await expect(requireOnboardedUser()).resolves.toMatchObject({ userId: 'u1' });
});

test('completeOnboarding rejects bad input without writing', async () => {
  const s = await completeOnboarding({}, new FormData());
  expect(s.errors?.adult).toBeTruthy();
  expect(update).not.toHaveBeenCalled();
});
test('completeOnboarding updates own row server-side then redirects', async () => {
  update.mockResolvedValue({ error: null });
  const f = new FormData();
  f.set('adult', 'on'); f.set('first_language', 'en'); f.set('onboarded_at', 'evil');
  await expect(completeOnboarding({}, f)).rejects.toThrow('REDIRECT:/today');
  const [v, col, id] = update.mock.calls[0];
  expect(col).toBe('user_id'); expect(id).toBe('u1');
  expect(v.onboarded_at).not.toBe('evil');
  expect(v.adult_attested_at).toBeTruthy();
  expect(v).toMatchObject({ first_language: 'en', study_minutes_per_day: 20, preferences: { font: 'default', reduced_motion: false } });
});

test('form shows labelled fields and the verbatim disclosure', () => {
  render(<OnboardingForm />);
  expect((screen.getByLabelText('I am 18 or older.') as HTMLInputElement).required).toBe(true);
  expect(screen.getByLabelText('Your first language')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Reading font' })).toBeTruthy();
  expect(screen.getByText(/Groq's terms say it does not train its models/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeTruthy();
});
