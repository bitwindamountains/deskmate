'use server';

import { redirect } from 'next/navigation';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { deleteCards, updateCard, updateStatus } from '@/lib/triage/card-actions';
import { createClient } from '@/lib/supabase/server';

async function session() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  if (!(await isOnboarded(db, userId))) throw new Error("We couldn't save that change.");
  return { db, userId };
}

export async function setStatus(ids: string[], status: 'kept' | 'suspended'): Promise<void> {
  const { db, userId } = await session();
  // updateStatus also accepts 'discarded'; this action only suspends and unsuspends
  if (status !== 'kept' && status !== 'suspended') throw new Error("We couldn't save that change.");
  await updateStatus(db, userId, ids, status);
}

export async function removeCards(ids: string[]): Promise<void> {
  const { db, userId } = await session();
  await deleteCards(db, userId, ids);
}

export async function saveCard(id: string, patch: { front: string; back: string }): Promise<void> {
  const { db, userId } = await session();
  await updateCard(db, userId, id, patch);
}
