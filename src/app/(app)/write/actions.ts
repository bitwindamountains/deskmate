'use server';

import { redirect } from 'next/navigation';
import { insertDraft, insertEssay, SAVE_FAILED, type CreateEssayResult, type EssayInput, type SaveDraftResult } from '@/lib/essay/create-essay';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  return { supabase, userId, onboarded: await isOnboarded(supabase, userId) };
}

export async function createEssay(input: EssayInput): Promise<CreateEssayResult> {
  const { supabase, userId, onboarded } = await session();
  if (!onboarded) return { ok: false, error: SAVE_FAILED };
  return insertEssay(supabase, userId, input);
}

export async function saveDraft(essayId: string, content: string): Promise<SaveDraftResult> {
  const { supabase, userId, onboarded } = await session();
  if (!onboarded) return { ok: false, error: SAVE_FAILED };
  return insertDraft(supabase, userId, essayId, content);
}
