import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); });
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

let claims: { sub: string } | null = { sub: 'u1' };
let profile: Record<string, unknown> | null = null;
const update = vi.fn();
const upsert = vi.fn();
let upsertError: unknown = null;
let secondReadError: unknown = null;
let reads = 0;
const isCalls: unknown[][] = [];
let updateResult: { data: unknown[] | null; error: unknown } = { data: [{ user_id: 'u1' }], error: null };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (++reads === 2 && secondReadError ? { data: null, error: secondReadError } : { data: profile }) }) }),
      upsert: async (...a: unknown[]) => {
        upsert(...a);
        if (!upsertError) profile = { user_id: 'u1', onboarded_at: null };
        return { error: upsertError };
      },
      update: (v: unknown) => {
        const chain: Record<string, unknown> = {};
        chain.eq = (...a: unknown[]) => { update(v, ...a); return chain; };
        chain.is = (...a: unknown[]) => { isCalls.push(a); return chain; };
        chain.select = async () => updateResult;
        return chain;
      },
    }),
  }),
}));

import { getProfile, requireOnboardedUser } from '@/lib/profile/require';
import { completeOnboarding } from '@/app/onboarding/actions';
import { OnboardingForm } from '@/app/onboarding/onboarding-form';

beforeEach(() => { redirect.mockClear(); update.mockReset(); upsert.mockReset(); upsertError = null; secondReadError = null; reads = 0; isCalls.length = 0; updateResult = { data: [{ user_id: 'u1' }], error: null }; profile = { user_id: 'u1', onboarded_at: null }; claims = { sub: 'u1' }; });
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
  expect(upsert).not.toHaveBeenCalled();
});
test('first visit creates the profile row for claims.sub, then reads it', async () => {
  profile = null;
  await expect(getProfile()).resolves.toEqual({ userId: 'u1', profile: { user_id: 'u1', onboarded_at: null } });
  expect(upsert).toHaveBeenCalledWith({ user_id: 'u1' }, { onConflict: 'user_id', ignoreDuplicates: true });
});
test('first-visit insert error is thrown, not hidden', async () => {
  profile = null;
  upsertError = new Error('denied');
  await expect(getProfile()).rejects.toThrow('denied');
});

test('read error after a successful first-visit insert is thrown, not returned as null profile', async () => {
  profile = null;
  upsertError = null;
  secondReadError = new Error('read failed');
  await expect(getProfile()).rejects.toThrow('read failed');
});

test('completeOnboarding rejects bad input without writing', async () => {
  const s = await completeOnboarding({}, new FormData());
  expect(s.errors?.adult).toBeTruthy();
  expect(update).not.toHaveBeenCalled();
});
test('first-time submit sends both timestamps, only for a not-yet-onboarded row', async () => {
  const f = new FormData();
  f.set('adult', 'on'); f.set('first_language', 'en'); f.set('onboarded_at', 'evil');
  await expect(completeOnboarding({}, f)).rejects.toThrow('REDIRECT:/today');
  const [v, col, id] = update.mock.calls[0];
  expect(col).toBe('user_id'); expect(id).toBe('u1');
  expect(v.onboarded_at).not.toBe('evil');
  expect(v.adult_attested_at).toBeTruthy();
  expect(v).toMatchObject({ first_language: 'en', study_minutes_per_day: 20, preferences: { font: 'default', reduced_motion: false } });
  expect(isCalls).toEqual([['onboarded_at', null]]);
});
test('edit submit sends neither timestamp and does not need the 18+ box', async () => {
  profile = { user_id: 'u1', onboarded_at: '2026-01-01' };
  const f = new FormData();
  f.set('first_language', 'en'); f.set('font', 'dyslexic');
  await expect(completeOnboarding({}, f)).rejects.toThrow('REDIRECT:/today');
  const [v] = update.mock.calls[0];
  expect(v).not.toHaveProperty('onboarded_at');
  expect(v).not.toHaveProperty('adult_attested_at');
  expect(v.preferences.font).toBe('dyslexic');
});
test('0-row update returns an error state and does not redirect', async () => {
  updateResult = { data: [], error: null };
  const f = new FormData();
  f.set('adult', 'on'); f.set('first_language', 'en');
  await expect(completeOnboarding({}, f)).resolves.toEqual({ error: "We couldn't save your answers. Please try again." });
  expect(redirect).not.toHaveBeenCalled();
});

test('form shows labelled fields and the verbatim disclosure', () => {
  render(<OnboardingForm />);
  expect((screen.getByLabelText('I am 18 or older.') as HTMLInputElement).required).toBe(true);
  expect(screen.getByLabelText('Your first language')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Reading font' })).toBeTruthy();
  expect(screen.getByText(/Groq's terms say it does not train its models/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeTruthy();
});

test('first-time mode: 18+ box required, button says Start studying', () => {
  render(<OnboardingForm />);
  expect((screen.getByLabelText('I am 18 or older.') as HTMLInputElement).required).toBe(true);
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeTruthy();
});
test('edit mode: no 18+ box, button says Save changes, disclosure stays', () => {
  render(<OnboardingForm defaults={{ user_id: 'u1', first_language: 'en', study_minutes_per_day: 20, preferences: { font: 'default', reduced_motion: false } } as never} />);
  expect(screen.queryByLabelText('I am 18 or older.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start studying' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  expect(screen.getByText(/Groq's terms say it does not train its models/)).toBeTruthy();
});
