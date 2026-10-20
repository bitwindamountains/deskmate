import { NextRequest } from 'next/server';
import { beforeEach, expect, test, vi } from 'vitest';

const exchange = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from '@/app/auth/callback/route';

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/auth/callback?${qs}`));

beforeEach(() => exchange.mockResolvedValue({ error: null }));

test('callback redirects to a safe next path', async () => {
  const res = await call('code=c&next=/study');
  expect(res.headers.get('location')).toBe('http://localhost:3000/study');
});

test('callback refuses an external next', async () => {
  const res = await call('code=c&next=https://evil.example');
  expect(res.headers.get('location')).toBe('http://localhost:3000/today');
});

test('callback with exchange error goes to /login?error=callback', async () => {
  exchange.mockResolvedValue({ error: { message: 'bad' } });
  const res = await call('code=c&next=/study');
  expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback');
});

test('callback without a code goes to /login?error=callback', async () => {
  const res = await call('next=/study');
  expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=callback');
});
