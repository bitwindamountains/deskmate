import { expect, test, vi } from 'vitest';
import { allowStart, cleanupDemos, DEMO_DOMAIN, isDemoUser } from '@/lib/demo/accounts';

const HOUR = 3_600_000;
const now = Date.parse('2026-11-27T12:00:00Z');
const user = (id: string, email: string, hoursAgo: number, demo = true) =>
  ({ id, email, created_at: new Date(now - hoursAgo * HOUR).toISOString(), app_metadata: demo ? { scholar_demo: true } : {} });

function fakeAdmin(users: ReturnType<typeof user>[]) {
  const deleted: string[] = [];
  const db = { auth: { admin: {
    listUsers: vi.fn(async () => ({ data: { users }, error: null })),
    deleteUser: vi.fn(async (id: string) => { deleted.push(id); return { error: null }; }),
  } } };
  return { db: db as never, deleted };
}

test('a demo user needs both the demo domain and the server-set flag', () => {
  expect(isDemoUser(user('a', `x@${DEMO_DOMAIN}`, 1))).toBe(true);
  expect(isDemoUser(user('b', `x@${DEMO_DOMAIN}`, 1, false))).toBe(false); // flag missing
  expect(isDemoUser(user('c', 'student@gmail.com', 1))).toBe(false); // flag alone isn't enough
  expect(isDemoUser(user('d', `x@${DEMO_DOMAIN}.evil.com`, 1))).toBe(false);
});

test('cleanup deletes expired demo accounts and never another app\'s user', async () => {
  const { db, deleted } = fakeAdmin([
    user('old-demo', `a@${DEMO_DOMAIN}`, 25), user('new-demo', `b@${DEMO_DOMAIN}`, 2),
    user('old-real', 'landlord@example.com', 500, false), user('spoofed', `c@${DEMO_DOMAIN}`, 500, false),
  ]);
  expect(await cleanupDemos(now, db)).toBe(1);
  expect(deleted).toEqual(['old-demo']);
});

test('cleanup makes room under the active cap by deleting the oldest demos first', async () => {
  const users = Array.from({ length: 26 }, (_, i) => user(`d${i}`, `d${i}@${DEMO_DOMAIN}`, i * 0.1));
  const { db, deleted } = fakeAdmin(users);
  await cleanupDemos(now, db);
  expect(deleted).toEqual(['d24', 'd25']); // keeps the newest 24, so the new account makes 25
});

test('a visitor can start 5 demos an hour', () => {
  for (let i = 0; i < 5; i++) expect(allowStart('1.2.3.4', now + i)).toBe(true);
  expect(allowStart('1.2.3.4', now + 10)).toBe(false);
  expect(allowStart('5.6.7.8', now + 10)).toBe(true);
  expect(allowStart('1.2.3.4', now + HOUR + 1)).toBe(true);
});
