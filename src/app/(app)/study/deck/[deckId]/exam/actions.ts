'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const SAVE_FAILED = "We couldn't save that change.";
const PAST = 'Pick a date from today onward.';
const Input = z.object({
  deckId: z.uuid(),
  date: z.iso.date().nullable(),
});

export async function setExamDate(deckId: string, date: string | null): Promise<{ ok: boolean; error?: string }> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  if (!(await isOnboarded(db, userId))) return { ok: false, error: SAVE_FAILED };

  const v = Input.safeParse({ deckId, date });
  if (!v.success) return { ok: false, error: SAVE_FAILED };
  // The server only knows UTC; allow one day of slack so a user west of UTC can still pick their local today.
  // The date field's min attribute enforces the exact local day in the browser.
  const earliest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (v.data.date && v.data.date < earliest) return { ok: false, error: PAST };

  const { data: rows, error } = await db.from('decks').update({ exam_date: v.data.date }).eq('id', deckId).eq('user_id', userId).select('id');
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!rows?.length) return { ok: false, error: "We couldn't find that deck." };
  return { ok: true };
}
