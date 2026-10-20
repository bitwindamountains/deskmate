import { beforeEach, expect, test, vi } from 'vitest';

const oauth = vi.fn();
const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithOAuth: oauth, verifyOtp } }),
}));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

import { signInWithGoogle, verifyEmailCode } from '@/app/login/actions';

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const k in o) f.set(k, o[k]); return f; };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SITE_URL', 'https://scholar.example');
  oauth.mockResolvedValue({ data: { url: 'https://google.example/auth' }, error: null });
  verifyOtp.mockResolvedValue({ error: null });
});

test.each([['/study', '/study'], ['https://evil.example', '/today']])('verifyEmailCode next %s -> %s', async (next, to) => {
  await expect(verifyEmailCode({ step: 'code' }, fd({ email: 'a@b.co', token: '123456', next }))).rejects.toThrow(`REDIRECT:${to}`);
});

test.each([['/study', '%2Fstudy'], ['https://evil.example', '%2Ftoday']])('google redirectTo next %s', async (next, enc) => {
  await expect(signInWithGoogle(fd({ next }))).rejects.toThrow('REDIRECT:https://google.example/auth');
  expect(oauth.mock.calls[0][0].options.redirectTo).toBe(`https://scholar.example/auth/callback?next=${enc}`);
});

test('google ignores Origin-like input and refuses without a site URL in production', async () => {
  vi.stubEnv('SITE_URL', '');
  vi.stubEnv('NODE_ENV', 'production');
  await expect(signInWithGoogle(fd({ next: '/study' }))).rejects.toThrow('REDIRECT:/login?error=callback&next=%2Fstudy');
  expect(oauth).not.toHaveBeenCalled();
});
