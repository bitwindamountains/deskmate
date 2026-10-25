import { beforeEach, expect, test, vi } from 'vitest';

const oauth = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const getClaims = vi.fn();
const updateUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOAuth: oauth, signInWithPassword, signUp, resetPasswordForEmail, getClaims, updateUser } }),
}));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

import * as login from '@/app/login/actions';

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f; };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SITE_URL', 'https://scholar.example');
  oauth.mockResolvedValue({ data: { url: 'https://google.example/auth' }, error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  signUp.mockResolvedValue({ data: { session: null }, error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } } });
  updateUser.mockResolvedValue({ error: null });
});

test.each([['/study', '/study'], ['https://evil.example', '/today']])('password sign-in next %s -> %s', async (next, to) => {
  await expect(login.signInWithPassword({ mode: 'signin' }, fd({ email: 'a@b.co', password: ' pass word ', next }))).rejects.toThrow(`REDIRECT:${to}`);
  // the password is sent exactly as typed, spaces included
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: ' pass word ' });
});

test('a wrong password and an unconfirmed email get different, plain messages', async () => {
  signInWithPassword.mockResolvedValueOnce({ error: { status: 400, code: 'invalid_credentials' } });
  expect((await login.signInWithPassword({ mode: 'signin' }, fd({ email: 'a@b.co', password: 'x' }))).error).toMatch(/don't match/);
  signInWithPassword.mockResolvedValueOnce({ error: { status: 400, code: 'email_not_confirmed' } });
  expect((await login.signInWithPassword({ mode: 'signin' }, fd({ email: 'a@b.co', password: 'x' }))).error).toMatch(/^Confirm your email/);
});

test('sign-up refuses a short password before calling Supabase', async () => {
  const r = await login.signUpWithPassword({ mode: 'signup' }, fd({ email: 'a@b.co', password: 'short' }));
  expect(r.error).toBe('Use a password of 8 to 72 characters.');
  expect(signUp).not.toHaveBeenCalled();
});

test('sign-up sends the confirmation link back through the callback to a safe next', async () => {
  const r = await login.signUpWithPassword({ mode: 'signup' }, fd({ email: 'a@b.co', password: 'long enough', next: 'https://evil.example' }));
  expect(r).toEqual({ mode: 'signup', email: 'a@b.co', sent: true });
  expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe('https://scholar.example/auth/callback?next=%2Ftoday');
});

test('sign-up goes straight in when Supabase returns a session', async () => {
  signUp.mockResolvedValueOnce({ data: { session: {} }, error: null });
  await expect(login.signUpWithPassword({ mode: 'signup' }, fd({ email: 'a@b.co', password: 'long enough', next: '/study' }))).rejects.toThrow('REDIRECT:/study');
});

test('a reset link comes back to the reset page', async () => {
  const r = await login.sendPasswordReset({ mode: 'forgot' }, fd({ email: 'a@b.co' }));
  expect(r).toEqual({ mode: 'forgot', email: 'a@b.co', sent: true });
  expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', { redirectTo: 'https://scholar.example/auth/callback?next=%2Freset-password' });
});

test('setting a new password needs a session and a long enough password', async () => {
  expect((await login.updatePassword({}, fd({ password: 'short' }))).error).toBe('Use a password of 8 to 72 characters.');
  getClaims.mockResolvedValueOnce({ data: null });
  await expect(login.updatePassword({}, fd({ password: 'long enough' }))).rejects.toThrow('REDIRECT:/login');
  expect(updateUser).not.toHaveBeenCalled();
  await expect(login.updatePassword({}, fd({ password: 'long enough' }))).rejects.toThrow('REDIRECT:/today');
  expect(updateUser).toHaveBeenCalledWith({ password: 'long enough' });
});

test.each([['/study', '%2Fstudy'], ['https://evil.example', '%2Ftoday']])('google redirectTo next %s', async (next, enc) => {
  await expect(login.signInWithGoogle(fd({ next }))).rejects.toThrow('REDIRECT:https://google.example/auth');
  expect(oauth.mock.calls[0][0].options.redirectTo).toBe(`https://scholar.example/auth/callback?next=${enc}`);
});

test('google ignores Origin-like input and refuses without a site URL in production', async () => {
  vi.stubEnv('SITE_URL', '');
  vi.stubEnv('NODE_ENV', 'production');
  await expect(login.signInWithGoogle(fd({ next: '/study' }))).rejects.toThrow('REDIRECT:/login?error=callback&next=%2Fstudy');
  expect(oauth).not.toHaveBeenCalled();
});
