import { randomBytes, randomUUID } from 'node:crypto';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { seedDemo } from './seed';

/**
 * Demo mode (DEMO_MODE=true, the public portfolio demo on Render): "Try the demo" makes a throwaway account seeded with sample data.
 * The Supabase project is shared with other apps, so demo users live only on this email domain and carry app_metadata.scholar_demo
 * (settable only with the secret key); cleanup deletes nothing that lacks both. Deleting the auth user cascades to every scholar row.
 */
export const isDemo = () => process.env.DEMO_MODE === 'true';
export const DEMO_DOMAIN = 'scholar-demo.invalid';
export const DEMO_LIFETIME_MS = 86_400_000;
const MAX_ACTIVE = 25;

type Admin = ReturnType<typeof admin>;
type AuthUser = { id: string; email?: string; created_at: string; app_metadata?: Record<string, unknown> };

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('demo mode needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY');
  return createAdmin(url, key, { db: { schema: 'scholar' }, auth: { persistSession: false, autoRefreshToken: false } });
}

export const isDemoUser = (u: AuthUser) => !!u.email?.endsWith(`@${DEMO_DOMAIN}`) && u.app_metadata?.scholar_demo === true;

async function demoUsers(db: Admin): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  // ponytail: pages through every user of the shared project; fine for a small project, needs a demo table if it grows past ~50k users.
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...(data.users as AuthUser[]).filter(isDemoUser));
    if (data.users.length < 1000) return out;
  }
}

/** Deletes expired demo accounts, and the oldest ones beyond MAX_ACTIVE - 1 so a new one fits. Never touches a non-demo user. */
export async function cleanupDemos(now = Date.now(), db: Admin = admin()): Promise<number> {
  const users = (await demoUsers(db)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const doomed = users.filter((u, i) => i >= MAX_ACTIVE - 1 || now - Date.parse(u.created_at) > DEMO_LIFETIME_MS);
  for (const u of doomed) {
    if (!isDemoUser(u)) continue; // belt and braces: the filter above already guarantees it
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) throw error;
  }
  return doomed.length;
}

/** A new seeded demo account. Returns the credentials to sign in with; they are never shown to the visitor. */
export async function createDemoAccount(now = new Date(), db: Admin = admin()): Promise<{ email: string; password: string }> {
  const email = `demo-${randomUUID()}@${DEMO_DOMAIN}`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { scholar_demo: true } });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  try {
    await seedDemo(db, data.user.id, now);
  } catch (e) {
    await db.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw e;
  }
  return { email, password };
}

const starts = new Map<string, number[]>();
const STARTS_PER_HOUR = 5;
/** ponytail: per server instance, in memory (Render's free plan runs one); the MAX_ACTIVE cap is the real bound. */
export function allowStart(ip: string, now = Date.now()): boolean {
  const recent = (starts.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= STARTS_PER_HOUR) { starts.set(ip, recent); return false; }
  starts.set(ip, [...recent, now]);
  return true;
}
