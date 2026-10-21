import { beforeEach, expect, test, vi } from 'vitest';

const calls: unknown[][] = [];
let insertError: unknown = null;
const chain = (label: string) => {
  const q = { eq: (...a: unknown[]) => { calls.push([label, 'eq', ...a]); return q; }, lt: (...a: unknown[]) => { calls.push([label, 'lt', ...a]); return q; },
    then: (r: (v: unknown) => void) => r({ error: null }) };
  return q;
};
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } } }) },
    from: (t: string) => ({
      update: (v: unknown) => { calls.push([t, 'update', v]); return chain(t); },
      insert: async (v: unknown) => { calls.push([t, 'insert', v]); return { error: insertError }; },
    }),
  }),
}));
vi.mock('@/lib/profile/is-onboarded', () => ({ isOnboarded: async () => true }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); } }));

import { disputeItem, logViewedLevel, markGotIt } from '@/app/(app)/write/[essayId]/item-actions';

const ID = '33333333-3333-4333-8333-333333333333';
beforeEach(() => { calls.length = 0; insertError = null; });

test('Got it updates only the caller\'s item and logs a got_it event', async () => {
  await markGotIt(ID);
  expect(calls).toEqual([
    ['feedback_items', 'update', { status: 'got_it' }], ['feedback_items', 'eq', 'id', ID], ['feedback_items', 'eq', 'user_id', 'u1'],
    ['feedback_events', 'insert', { user_id: 'u1', item_id: ID, action: 'got_it', level: null }],
  ]);
});

test('a dispute needs a 1-1,000 character reason and never writes a bad one', async () => {
  await expect(disputeItem(ID, '   ')).rejects.toThrow("We couldn't save that change.");
  await expect(disputeItem(ID, 'x'.repeat(1001))).rejects.toThrow("We couldn't save that change.");
  await expect(disputeItem('not-a-uuid', 'fine')).rejects.toThrow();
  expect(calls).toEqual([]);
  await disputeItem(ID, ' Too strict ');
  expect(calls[0]).toEqual(['feedback_items', 'update', { status: 'disputed', dispute_reason: 'Too strict' }]);
});

test('viewed level only raises highest_level, and a failed event write is a generic error', async () => {
  await logViewedLevel(ID, 2);
  expect(calls).toContainEqual(['feedback_items', 'lt', 'highest_level', 2]);
  await expect(logViewedLevel(ID, 3 as 1)).rejects.toThrow();
  insertError = { message: 'secret db text' };
  await expect(markGotIt(ID)).rejects.toThrow("We couldn't save that change.");
});
