import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Spec §11: the free Supabase project pauses after a week without activity. Vercel cron calls this daily (vercel.json).
 * No secret: it runs `select true` as anon, which anyone with the public key can already do.
 */
export async function GET(): Promise<NextResponse> {
  const db = await createClient();
  const { data, error } = await db.rpc('ping');
  return !error && data === true ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 503 });
}
