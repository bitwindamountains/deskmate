'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PATTERNS, type PatternKey } from '@/growth/patterns';
import { TEMPLATES } from '@/growth/templates';
import { addPractice, type PracticeResult } from '@/lib/growth/practice';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const FAILED = { ok: false, message: "We couldn't add those cards. Try again." } as const;

export async function practicePattern(pattern: string): Promise<PracticeResult> {
  // Trust boundary: only a known pattern that has a template set.
  if (!Object.hasOwn(PATTERNS, pattern) || !Object.hasOwn(TEMPLATES, pattern)) return FAILED;
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  if (!(await isOnboarded(db, userId))) return FAILED;
  const r = await addPractice(db, userId, pattern as PatternKey);
  if (r.ok && r.added) revalidatePath('/study');
  return r;
}
