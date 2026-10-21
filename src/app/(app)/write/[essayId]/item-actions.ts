'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { createClient } from '@/lib/supabase/server';

const SAVE_FAILED = "We couldn't save that change.";
function fail(): never { throw new Error(SAVE_FAILED); }

const Id = z.uuid();
const Reason = z.string().trim().min(1).max(1000);

async function session() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');
  if (!(await isOnboarded(db, userId))) fail();
  return { db, userId };
}

// Every write is scoped to userId on top of RLS. Never surfaces DB error text.
async function write(itemId: string, patch: Record<string, unknown>, event: { action: 'viewed_level' | 'got_it' | 'disagree'; level?: number },
  onlyBelow?: number) {
  if (!Id.safeParse(itemId).success) fail();
  const { db, userId } = await session();
  let q = db.from('feedback_items').update(patch).eq('id', itemId).eq('user_id', userId);
  if (onlyBelow !== undefined) q = q.lt('highest_level', onlyBelow); // never lower a level the hint route already raised
  const { error } = await q;
  if (error) fail();
  const { error: evErr } = await db.from('feedback_events').insert({ user_id: userId, item_id: itemId, action: event.action, level: event.level ?? null });
  if (evErr) fail();
}

export async function markGotIt(itemId: string): Promise<void> {
  await write(itemId, { status: 'got_it' }, { action: 'got_it' });
}

export async function disputeItem(itemId: string, reason: string): Promise<void> {
  const r = Reason.safeParse(reason);
  if (!r.success) fail();
  await write(itemId, { status: 'disputed', dispute_reason: r.data }, { action: 'disagree' });
}

export async function logViewedLevel(itemId: string, level: 1 | 2): Promise<void> {
  if (level !== 1 && level !== 2) fail();
  await write(itemId, { highest_level: level }, { action: 'viewed_level', level }, level);
}
