import { beforeEach, expect, test, vi } from 'vitest';

const rpc = vi.fn();
const signOut = vi.fn();
const getClaims = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, auth: { getClaims, signOut } }) }));
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

import { deleteMyData } from '@/app/(app)/profile/actions';

const fd = (confirm: string) => { const f = new FormData(); f.set('confirm', confirm); return f; };

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } } });
  rpc.mockResolvedValue({ error: null });
});

test('without the typed confirmation nothing is deleted', async () => {
  expect(await deleteMyData(fd('yes'))).toBe('Type delete to confirm.');
  expect(rpc).not.toHaveBeenCalled();
});

test('a confirmed delete removes the data, signs out, and lands on sign-in', async () => {
  await expect(deleteMyData(fd(' Delete '))).rejects.toThrow('REDIRECT:/login?deleted=1');
  expect(rpc).toHaveBeenCalledWith('delete_my_data');
  expect(signOut).toHaveBeenCalled();
});

test('a failed delete says so and keeps the session', async () => {
  rpc.mockResolvedValue({ error: { message: 'boom' } });
  expect(await deleteMyData(fd('delete'))).toBe("We couldn't delete your data, and nothing was removed. Try again.");
  expect(signOut).not.toHaveBeenCalled();
});

test('signed out: back to sign-in, nothing deleted', async () => {
  getClaims.mockResolvedValue({ data: null });
  await expect(deleteMyData(fd('delete'))).rejects.toThrow('REDIRECT:/login');
  expect(rpc).not.toHaveBeenCalled();
});
