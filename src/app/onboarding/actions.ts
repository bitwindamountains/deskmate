'use server';

import { redirect } from 'next/navigation';
import { parseOnboarding } from '@/lib/profile/onboarding';
import { createClient } from '@/lib/supabase/server';

export type OnboardingState = { errors?: Record<string, string>; error?: string };

export async function completeOnboarding(_prev: OnboardingState, fd: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  // server decides edit vs first-time from the stored row, never from the client
  const { data: existing } = await supabase.from('profiles').select('onboarded_at').eq('user_id', userId).maybeSingle();
  const editing = !!existing?.onboarded_at;
  const parsed = parseOnboarding(fd, { requireAdult: !editing });
  if (!parsed.ok) return { errors: parsed.errors };
  const v = parsed.value;
  const now = new Date().toISOString();
  const fields = {
    study_minutes_per_day: v.study_minutes_per_day,
    preferences: { font: v.font, reduced_motion: v.reduced_motion, show_scores: v.show_scores },
  };
  const q = supabase.from('profiles').update(editing ? fields : { ...fields, adult_attested_at: now, onboarded_at: now }).eq('user_id', userId);
  // first completion only: keep the original consent timestamp from being overwritten
  const { data: rows, error } = await (editing ? q : q.is('onboarded_at', null)).select('user_id');
  if (error || !rows?.length) return { error: "We couldn't save your answers. Please try again." };
  redirect('/today');
}
