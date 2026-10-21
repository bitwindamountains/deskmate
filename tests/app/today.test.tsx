import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { Profile } from '@/lib/profile/require';

let profile: Profile;
vi.mock('@/lib/profile/require', () => ({ requireOnboardedUser: async () => ({ userId: 'u1', profile }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/review/load', () => ({ loadStudy: async () => ({ decks: [], cards: [], newIntroducedToday: 0 }) }));

import AppLayout from '@/app/(app)/layout';
import TodayPage from '@/app/(app)/today/page';
import StudyPage from '@/app/(app)/study/page';
import ProfilePage from '@/app/(app)/profile/page';

const base: Profile = {
  user_id: 'u1', display_name: null, adult_attested_at: '2026-01-01', first_language: 'en',
  study_minutes_per_day: 20, preferences: { font: 'default', reduced_motion: false }, onboarded_at: '2026-01-01',
};
afterEach(cleanup);

test('Today shows the empty state with an Import material link to /study/import', async () => {
  profile = base;
  render(await TodayPage());
  expect(screen.getByRole('heading', { name: 'Nothing to study yet' })).toBeTruthy();
  expect(screen.getByText('Turn your notes into a few good flashcards.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import material' }).getAttribute('href')).toBe('/study/import');
  expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('main')).toBeTruthy();
});

test('dyslexic preference sets data-font on body', async () => {
  profile = { ...base, preferences: { font: 'dyslexic', reduced_motion: true } };
  render(await AppLayout({ children: <p>child</p> }));
  const root = document.body.querySelector('[data-font]');
  expect(root?.getAttribute('data-font')).toBe('dyslexic');
  expect(root?.getAttribute('data-reduced-motion')).toBe('true');
  expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
});

test('default preferences set data-font="default" and no reduced motion', async () => {
  profile = base;
  render(await AppLayout({ children: <p>child</p> }));
  const root = document.body.querySelector('[data-font]');
  expect(root?.getAttribute('data-font')).toBe('default');
  expect(root?.getAttribute('data-reduced-motion')).toBe('false');
});

test('Study shows Your decks with the same empty state', () => {
  render(<StudyPage />);
  expect(screen.getByRole('heading', { name: 'Your decks' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Nothing to study yet' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import material' }).getAttribute('href')).toBe('/study/import');
});

test('Profile shows preferences, an edit link, and a POST sign-out form', async () => {
  profile = { ...base, preferences: { font: 'dyslexic', reduced_motion: true } };
  render(await ProfilePage());
  expect(screen.getByText('Dyslexia-friendly')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Change preferences' }).getAttribute('href')).toBe('/onboarding?edit=1');
  const form = screen.getByRole('button', { name: 'Sign out' }).closest('form');
  expect(form?.getAttribute('method')).toBe('post');
  expect(form?.getAttribute('action')).toBe('/auth/signout');
});
