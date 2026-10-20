'use server';

import { redirect } from 'next/navigation';
import { updateCard, updateEmbeddings, updateStatus } from '@/lib/triage/card-actions';
import { createClient } from '@/lib/supabase/server';

async function session() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  return { db, userId };
}

export async function setCardStatus(ids: string[], status: 'kept' | 'discarded', reason?: 'trivial' | 'wrong' | 'duplicate' | 'unclear'): Promise<void> {
  const { db, userId } = await session();
  await updateStatus(db, userId, ids, status, reason);
}

export async function editCard(id: string, patch: { front?: string; back?: string }): Promise<void> {
  const { db, userId } = await session();
  await updateCard(db, userId, id, patch);
}

export async function saveEmbeddings(rows: { id: string; embedding: number[] }[]): Promise<void> {
  const { db, userId } = await session();
  await updateEmbeddings(db, userId, rows);
}
