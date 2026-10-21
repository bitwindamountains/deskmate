import type { SupabaseClient } from '@supabase/supabase-js';

/** Server-side gate for actions and routes: the caller finished onboarding (incl. the 18+ attestation). Fails closed on a read error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the schema generic differs between server and test clients
export async function isOnboarded(db: SupabaseClient<any, any, any>, userId: string): Promise<boolean> {
  const { data, error } = await db.from('profiles').select('onboarded_at').eq('user_id', userId).maybeSingle();
  return !error && !!data?.onboarded_at;
}
