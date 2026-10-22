import { expect, test, vi } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const { practicePattern } = await import('@/app/(app)/progress/actions');

test('practicePattern rejects an unknown pattern without touching the database', async () => {
  expect(await practicePattern('spelling')).toEqual({ ok: false, message: "We couldn't add those cards. Try again." });
  expect(await practicePattern('nonsense')).toEqual({ ok: false, message: "We couldn't add those cards. Try again." });
  expect(await practicePattern('constructor')).toEqual({ ok: false, message: "We couldn't add those cards. Try again." });
  expect(createClient).not.toHaveBeenCalled();
});
