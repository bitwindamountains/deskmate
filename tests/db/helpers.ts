import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
if (!secret) throw new Error('Set SUPABASE_SECRET_KEY in .env.local to run DB tests');
if (!url || !publishable) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local to run DB tests');

const options = { db: { schema: 'scholar' }, auth: { persistSession: false, autoRefreshToken: false } } as const;
const publishableClient = () => createClient(url, publishable, options);
export type Client = ReturnType<typeof publishableClient>;

/** Secret key: bypasses RLS. Server-only. */
export function adminClient(): Client {
  return createClient(url, secret, options);
}

export function anonClient(): Client {
  return publishableClient();
}

/** Shared project: only ever creates (and later deletes) users on this throwaway email domain. */
export async function createTestUser(): Promise<{ client: Client; userId: string; email: string }> {
  const email = `scholar-test-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  const client = publishableClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    await deleteTestUser(data.user.id);
    throw signInError;
  }
  return { client, userId: data.user.id, email };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) throw error;
}
