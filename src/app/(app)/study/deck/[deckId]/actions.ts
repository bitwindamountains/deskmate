'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { addOneCard, importAnkiCards, importCards, type ImportResult } from '@/lib/cards/transfer';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { deleteCards, updateCard, updateStatus } from '@/lib/triage/card-actions';
import { createClient } from '@/lib/supabase/server';
import { conceptKey, wouldCycle } from '@/review/prereqs';

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

export async function importCsv(deckId: string, text: string): Promise<ImportResult> {
  if (!z.uuid().safeParse(deckId).success || typeof text !== 'string' || text.length > MAX_CSV_BYTES) {
    return { ok: false, message: "We couldn't import that file. Check it's a CSV under 1 MB." };
  }
  const { db, userId } = await session();
  const r = await importCards(db, userId, deckId, text);
  if (r.ok && r.added) revalidatePath(`/study/deck/${deckId}`);
  return r;
}

export async function importAnki(deckId: string, cards: unknown): Promise<ImportResult> {
  if (!z.uuid().safeParse(deckId).success) return { ok: false, message: "We couldn't import that file." };
  const { db, userId } = await session();
  const r = await importAnkiCards(db, userId, deckId, cards);
  if (r.ok && r.added) revalidatePath(`/study/deck/${deckId}`);
  return r;
}

export async function addCard(deckId: string, input: unknown): Promise<ImportResult> {
  if (!z.uuid().safeParse(deckId).success) return { ok: false, message: "We couldn't find that deck." };
  const { db, userId } = await session();
  const r = await addOneCard(db, userId, deckId, input);
  if (r.ok && r.added) revalidatePath(`/study/deck/${deckId}`);
  return r;
}

const GoalsInput = z.object({ deckId: z.uuid(), goals: z.string().max(5000), matched: z.array(z.uuid()).max(2000).nullable() });
export type SaveGoalsResult = { ok: true; matched: number } | { ok: false; message: string };

/** B4.3: matched holds the card ids the device matched to the goals; null when the model couldn't load (matches stay). */
export async function saveGoals(deckId: string, goals: string, matched: string[] | null): Promise<SaveGoalsResult> {
  const failed = { ok: false as const, message: "We couldn't save your goals." };
  const v = GoalsInput.safeParse({ deckId, goals, matched });
  if (!v.success) return failed;
  const { db } = await session();
  const { data, error } = await db.rpc('set_goal_matches', { p_deck: v.data.deckId, p_goals: v.data.goals, p_ids: v.data.matched });
  if (error || typeof data !== 'number') return failed;
  revalidatePath(`/study/deck/${deckId}`);
  return { ok: true, matched: data };
}

const Edge = z.object({ deckId: z.uuid(), concept: z.string().transform(conceptKey).pipe(z.string().min(1).max(120)),
  prereq: z.string().transform(conceptKey).pipe(z.string().min(1).max(120)) });
export type PrereqResult = { ok: true } | { ok: false; message: string };
const PREREQ_FAILED = { ok: false as const, message: "We couldn't save that." };

/** B4.1: concept builds on prereq. RLS limits it to the student's own deck. */
export async function addPrereq(deckId: string, concept: string, prereq: string): Promise<PrereqResult> {
  const v = Edge.safeParse({ deckId, concept, prereq });
  if (!v.success) return PREREQ_FAILED;
  const e = v.data;
  if (e.concept === e.prereq) return { ok: false, message: "A concept can't build on itself." };
  const { db, userId } = await session();
  const { data, error } = await db.from('concept_prereqs').select('concept,prereq').eq('deck_id', e.deckId);
  if (error) return PREREQ_FAILED;
  if (wouldCycle(data.map((r) => ({ deckId: e.deckId, concept: r.concept, prereq: r.prereq })), e.deckId, e.concept, e.prereq)) {
    return { ok: false, message: `That would make a loop: ${e.prereq} already builds on ${e.concept}.` };
  }
  const ins = await db.from('concept_prereqs').insert({ user_id: userId, deck_id: e.deckId, concept: e.concept, prereq: e.prereq });
  if (ins.error && ins.error.code !== '23505') return PREREQ_FAILED; // 23505: already there, which is what the student wanted
  revalidatePath('/study/mastery');
  return { ok: true };
}

export async function removePrereq(deckId: string, concept: string, prereq: string): Promise<PrereqResult> {
  const v = Edge.safeParse({ deckId, concept, prereq });
  if (!v.success) return PREREQ_FAILED;
  const { db } = await session();
  const { error } = await db.from('concept_prereqs').delete()
    .eq('deck_id', v.data.deckId).eq('concept', v.data.concept).eq('prereq', v.data.prereq);
  if (error) return PREREQ_FAILED;
  revalidatePath('/study/mastery');
  return { ok: true };
}
