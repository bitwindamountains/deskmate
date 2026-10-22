'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { importCards } from '@/lib/cards/transfer';
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

const MAX_CSV_BYTES = 1_000_000; // 2,000 rows of 500-character fields fit well under this

export async function importCsv(deckId: string, text: string): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
  if (!z.uuid().safeParse(deckId).success || typeof text !== 'string' || text.length > MAX_CSV_BYTES) {
    return { ok: false, message: "We couldn't import that file. Check it's a CSV under 1 MB." };
  }
  const { db, userId } = await session();
  const r = await importCards(db, userId, deckId, text);
  if (r.ok && r.added) revalidatePath(`/study/deck/${deckId}`);
  return r;
}
