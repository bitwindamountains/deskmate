'use server';

import { redirect } from 'next/navigation';
import { insertEssay, SAVE_FAILED, type CreateEssayResult, type EssayInput } from '@/lib/essay/create-essay';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

export async function createEssay(input: EssayInput): Promise<CreateEssayResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  if (!(await isOnboarded(supabase, userId))) return { ok: false, error: SAVE_FAILED };
  return insertEssay(supabase, userId, input);
}
