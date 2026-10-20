'use server';

import { redirect } from 'next/navigation';
import { parseOnboarding } from '@/lib/profile/onboarding';
import { createClient } from '@/lib/supabase/server';

export type OnboardingState = { errors?: Record<string, string>; error?: string };

export async function completeOnboarding(_prev: OnboardingState, fd: FormData): Promise<OnboardingState> {
  const parsed = parseOnboarding(fd);
  if (!parsed.ok) return { errors: parsed.errors };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  const v = parsed.value;
  const now = new Date().toISOString();
  const { error } = await supabase.from('profiles').update({
    adult_attested_at: now,
    onboarded_at: now,
    first_language: v.first_language,
    study_minutes_per_day: v.study_minutes_per_day,
    preferences: { font: v.font, reduced_motion: v.reduced_motion },
  }).eq('user_id', userId);
  if (error) return { error: 'Something went wrong. Try again.' };
  redirect('/today');
}
