// Browser-only: the review outbox's network side and the device wipe at sign-out.
import { Rating } from 'ts-fsrs';
import { ESSAY_DRAFT_PREFIX } from '@/lib/essay/text';
import { createClient } from '@/lib/supabase/client';
import type { GradeAnswer } from '@/llm/schemas';
import type { StateRow } from './schedule';
import { db, type ReviewPayload } from './store';
import { syncOutbox, type SyncDeps } from './sync';

const LLM_RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
const SHELL_CACHE = 'scholar-shell-v1'; // public/sw.js

export async function requestGrade(cardId: string, answer: string): Promise<GradeAnswer | null> {
  try {
    const res = await fetch('/api/grade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId, answer }) });
    if (!res.ok || res.redirected) return null;
    // /api/grade already validates with GradeAnswer; parsing again here would ship zod to the review page.
    return ((await res.json())?.result as GradeAnswer | undefined) ?? null;
  } catch {
    return null; // offline: the caller falls back to self-grading
  }
}

export async function recordReview(review: ReviewPayload, state: StateRow) {
  const { error } = await createClient().rpc('record_review', { p_review: review, p_state: state });
  if (error) throw error;
}

const deps: SyncDeps = {
  recordReview,
  grade: async (cardId, answer) => {
    const r = await requestGrade(cardId, answer);
    return r ? { ok: true, suggested: LLM_RATING[r.suggested_rating], score: r.score } : { ok: false };
  },
};

// One sync at a time: an `online` event during an end-of-session sync must not send the same rows twice.
let syncing: Promise<unknown> | null = null;
export const runSync = () => (syncing ??= syncOutbox(deps, new Date()).catch(() => {}).finally(() => { syncing = null; }));

/**
 * Sign-out on a shared device: sync, then wipe the cached cards and the offline pages so the next person sees none of them.
 * Returns how many reviews could not be sent; the caller asks before discarding them.
 */
export async function unsyncedReviews(): Promise<number> {
  await runSync();
  return db.outbox.count().catch(() => 0);
}
export async function clearDeviceData(): Promise<void> {
  try {
    // unsent essay edits are student text too; a shared device must not keep them
    for (const k of Object.keys(localStorage)) if (k.startsWith(ESSAY_DRAFT_PREFIX)) localStorage.removeItem(k);
  } catch { /* storage blocked (private mode): nothing was saved there */ }
  await Promise.allSettled([db.delete(), typeof caches === 'undefined' ? null : caches.delete(SHELL_CACHE)]);
}
