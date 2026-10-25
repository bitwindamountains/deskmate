'use server';

import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth/paths';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/auth/password';
import { siteUrl } from '@/lib/auth/site-url';
import { createClient } from '@/lib/supabase/server';

export type LoginMode = 'signin' | 'signup' | 'forgot';
/** sent: an email went out (sign-up confirmation or password reset) and the form shows where to look. */
export type LoginState = { mode: LoginMode; email?: string; error?: string; sent?: boolean };


const RATE_LIMITED = 'Too many attempts. Wait a minute, then try again.';
const WRONG = "That email and password don't match. Check them, or reset your password.";
const NOT_CONFIRMED = 'Confirm your email first: open the link we sent when you signed up.';
const GENERIC = 'Something went wrong. Try again.';
const PASSWORD_LENGTH = `Use a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;

const isRateLimited = (e: { status?: number; code?: string }) =>
  e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit';

const field = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string).trim() : '');
// Passwords are never trimmed: a space is a character the student chose.
const secret = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
const callback = (site: string, next: string) => `${site}/auth/callback?next=${encodeURIComponent(next)}`;

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNext(field(formData, 'next'));
  const failed = `/login?error=callback&next=${encodeURIComponent(next)}`;
  const site = siteUrl();
  if (!site) redirect(failed);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback(site, next) } });
  if (error || !data.url) redirect(failed);
  redirect(data.url);
}

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, 'email');
  const password = secret(formData, 'password');
  if (!email || !password) return { mode: 'signin', email, error: 'Enter your email and password.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = isRateLimited(error) ? RATE_LIMITED : error.code === 'email_not_confirmed' ? NOT_CONFIRMED : WRONG;
    return { mode: 'signin', email, error: msg };
  }
  redirect(safeNext(field(formData, 'next')));
}

export async function signUpWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, 'email');
  const password = secret(formData, 'password');
  const next = safeNext(field(formData, 'next'));
  if (!email) return { mode: 'signup', error: 'Enter your email address.' };
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { mode: 'signup', email, error: PASSWORD_LENGTH };
  const site = siteUrl();
  if (!site) return { mode: 'signup', email, error: GENERIC };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(site, next) } });
  if (error) {
    const msg = isRateLimited(error) ? RATE_LIMITED : error.code === 'weak_password' ? PASSWORD_LENGTH : GENERIC;
    return { mode: 'signup', email, error: msg };
  }
  // With email confirmation off there is a session already; otherwise the student confirms from the email first.
  // An address that already has an account gets the same answer, so sign-up doesn't reveal who is registered.
  if (data.session) redirect(next);
  return { mode: 'signup', email, sent: true };
}

export async function sendPasswordReset(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = field(formData, 'email');
  if (!email) return { mode: 'forgot', error: 'Enter your email address.' };
  const site = siteUrl();
  if (!site) return { mode: 'forgot', email, error: GENERIC };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback(site, '/reset-password') });
  if (error) return { mode: 'forgot', email, error: isRateLimited(error) ? RATE_LIMITED : GENERIC };
  return { mode: 'forgot', email, sent: true };
}

/** After the reset link: the callback has signed the student in, so this sets the new password on that session. */
export async function updatePassword(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const password = secret(formData, 'password');
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { error: PASSWORD_LENGTH };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === 'same_password' ? 'Choose a password you haven’t used here before.' : error.code === 'weak_password' ? PASSWORD_LENGTH : GENERIC };
  redirect('/today');
}
