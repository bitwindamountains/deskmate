'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Brief E4: deletes the student's Scholar data (not the shared sign-in), then signs out. Resolves to an error message. */
export async function deleteMyData(form: FormData): Promise<string> {
  if (String(form.get('confirm') ?? '').trim().toLowerCase() !== 'delete') return 'Type delete to confirm.';
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  // One function call is one transaction, so a failure removes nothing.
  const { error } = await db.rpc('delete_my_data');
  if (error) return "We couldn't delete your data, and nothing was removed. Try again.";
  await db.auth.signOut();
  redirect('/login?deleted=1');
}
