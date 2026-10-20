import { afterEach, expect, test, vi } from 'vitest';
import { siteUrl } from '@/lib/auth/site-url';

afterEach(() => vi.unstubAllEnvs());

test('uses SITE_URL when set', () => {
  vi.stubEnv('SITE_URL', 'https://scholar.example');
  vi.stubEnv('NODE_ENV', 'production');
  expect(siteUrl()).toBe('https://scholar.example');
});
test('falls back to localhost outside production', () => {
  vi.stubEnv('SITE_URL', '');
  vi.stubEnv('NODE_ENV', 'development');
  expect(siteUrl()).toBe('http://localhost:3000');
});
test('is null in production when unset', () => {
  vi.stubEnv('SITE_URL', '');
  vi.stubEnv('NODE_ENV', 'production');
  expect(siteUrl()).toBeNull();
});
