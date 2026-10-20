'use server';

import { redirect } from 'next/navigation';
import { insertSource, type CreateSourceResult } from '@/lib/import/create-source';
import type { ImportInput } from '@/lib/import/validate';
import { createClient } from '@/lib/supabase/server';

export async function createSource(i: ImportInput): Promise<CreateSourceResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  return insertSource(supabase, userId, i);
}
