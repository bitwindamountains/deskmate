import { expect, test, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));

import { GET } from '@/app/api/keep-alive/route';
import vercel from '../../vercel.json';

test('the ping reaches the database and answers 200', async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  const res = await GET();
  expect(res.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('ping');
});

test('a database that does not answer shows as 503 in the cron log', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'paused' } });
  expect((await GET()).status).toBe(503);
});

test('Vercel runs it once a day, which the Hobby plan allows', () => {
  expect(vercel.crons).toEqual([{ path: '/api/keep-alive', schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) }]);
});
