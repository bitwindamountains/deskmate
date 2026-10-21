import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: vi.fn() }) }));
import { clearDeviceData } from '@/review/client-sync';

test('sign-out wipes unsaved essay edits but leaves other sites\' and settings keys alone', async () => {
  localStorage.setItem('scholar-essay-draft-11111111-1111-4111-8111-111111111111', 'my unsent essay');
  localStorage.setItem('scholar-essay-draft-22222222-2222-4222-8222-222222222222', 'another');
  localStorage.setItem('unrelated-key', 'keep me');
  await clearDeviceData();
  expect(Object.keys(localStorage).filter((k) => k.startsWith('scholar-essay-draft-'))).toEqual([]);
  expect(localStorage.getItem('unrelated-key')).toBe('keep me');
});
