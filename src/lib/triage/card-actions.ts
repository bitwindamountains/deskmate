import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
type Db = SupabaseClient<any, any, any>;
const SAVE_FAILED = "We couldn't save that change.";
function fail(): never { throw new Error(SAVE_FAILED); }

const Ids = z.array(z.uuid()).min(1).max(200);
const Status = z.object({ ids: Ids, status: z.enum(['kept', 'discarded', 'suspended']), reason: z.enum(['trivial', 'wrong', 'duplicate', 'unclear']).optional() });
const Text = z.string().trim().min(1).max(500);
const Edit = z.object({ id: z.uuid(), patch: z.object({ front: Text.optional(), back: Text.optional() }).strict()
  .refine((p) => p.front !== undefined || p.back !== undefined) });
const Embeddings = z.array(z.object({ id: z.uuid(), embedding: z.array(z.number().finite()).length(384) })).min(1).max(200);

// Every write is scoped to userId on top of RLS. Never surfaces DB error text.
export async function updateStatus(db: Db, userId: string, ids: string[], status: 'kept' | 'discarded' | 'suspended', reason?: 'trivial' | 'wrong' | 'duplicate' | 'unclear') {
  const v = Status.safeParse({ ids, status, reason });
  if (!v.success) fail();
  const { error } = await db.from('cards')
    .update({ status, discard_reason: status === 'discarded' ? reason ?? null : null })
    .in('id', ids).eq('user_id', userId);
  if (error) fail();
}

// card_states, reviews and card_aids cascade with the card.
export async function deleteCards(db: Db, userId: string, ids: string[]) {
  if (!Ids.safeParse(ids).success) fail();
  const { error } = await db.from('cards').delete().in('id', ids).eq('user_id', userId);
  if (error) fail();
}

export async function updateCard(db: Db, userId: string, id: string, patch: { front?: string; back?: string }) {
  const v = Edit.safeParse({ id, patch });
  if (!v.success) fail();
  // A saved rewording (B3.1) belongs to the old question and answer, so an edit drops it.
  const { error } = await db.from('cards').update({ ...v.data.patch, variants: [] }).eq('id', id).eq('user_id', userId);
  if (error) fail();
}

export async function updateEmbeddings(db: Db, userId: string, rows: { id: string; embedding: number[] }[]) {
  const v = Embeddings.safeParse(rows);
  if (!v.success) fail();
  const results = await Promise.all(rows.map((r) => db.from('cards').update({ embedding: r.embedding }).eq('id', r.id).eq('user_id', userId)));
  if (results.some((r) => r.error)) fail();
}
