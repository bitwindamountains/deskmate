import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Profile = {
  user_id: string; display_name: string | null; adult_attested_at: string | null; first_language: string | null;
  study_minutes_per_day: number; preferences: { font?: 'default' | 'dyslexic'; reduced_motion?: boolean }; onboarded_at: string | null;
};

export async function getProfile(): Promise<{ userId: string; profile: Profile | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  const read = () => supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  let { data: profile } = await read();
  if (!profile) {
    // No auth.users trigger in the shared project: the user creates their own row on first visit (RLS: user_id = auth.uid()).
    const { error } = await supabase.from('profiles').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw error;
    ({ data: profile } = await read());
  }
  return { userId, profile: profile as Profile | null };
}

export async function requireOnboardedUser(): Promise<{ userId: string; profile: Profile }> {
  const { userId, profile } = await getProfile();
  if (!profile?.onboarded_at) redirect('/onboarding');
  return { userId, profile };
}
