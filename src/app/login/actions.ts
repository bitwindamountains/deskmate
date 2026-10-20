'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { step: 'email' | 'code'; email?: string; error?: string };

const RATE_LIMITED = 'Too many attempts. Wait a minute, then try again.';
const BAD_CODE = "That code didn't work. Check it, or send a new one.";
const GENERIC = 'Something went wrong. Try again.';

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return h.get('origin') ?? `${proto}://${host}`;
}

const isRateLimited = (e: { status?: number; code?: string }) =>
  e.status === 429 || e.code === 'over_email_send_rate_limit';

const field = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string).trim() : '');

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const next = safeNext(field(formData, 'next'));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect('/login?error=callback');
  redirect(data.url);
}

export async function sendEmailCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, 'email');
  if (!email) return { step: 'email', error: 'Enter your email address.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { step: 'email', email, error: isRateLimited(error) ? RATE_LIMITED : GENERIC };
  return { step: 'code', email };
}

export async function verifyEmailCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, 'email');
  const token = field(formData, 'token');
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { step: 'code', email, error: isRateLimited(error) ? RATE_LIMITED : BAD_CODE };
  redirect(safeNext(field(formData, 'next')));
}
