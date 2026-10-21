import { afterAll, beforeAll, expect, test } from 'vitest';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
  // first-visit rows, as getProfile creates them
  for (const u of [A, B]) {
    const { error } = await u.client.from('profiles').upsert({ user_id: u.userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw error;
  }
});

afterAll(async () => {
  await deleteTestUsers(created);
});

const row = async (u: User) => (await adminClient().from('profiles').select('*').eq('user_id', u.userId).single()).data;

// ponytail: completeOnboarding builds its query from a Next request-scoped client, so these
// replicate its exact update queries (src/app/onboarding/actions.ts) against a real session client.
const fields = { first_language: 'en', study_minutes_per_day: 20, preferences: { font: 'default', reduced_motion: false } };
const firstTime = (u: User, now = new Date().toISOString()) =>
  u.client.from('profiles').update({ ...fields, adult_attested_at: now, onboarded_at: now }).eq('user_id', u.userId).is('onboarded_at', null).select('user_id');

test('completing onboarding sets both timestamps for own row only', async () => {
  const { data, error } = await firstTime(A);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  const a = await row(A);
  expect(a?.adult_attested_at).toBeTruthy();
  expect(a?.onboarded_at).toBeTruthy();
  expect(a?.first_language).toBe('en');
  expect(await row(B)).toMatchObject({ adult_attested_at: null, onboarded_at: null, first_language: null });
});

test('a second first-time update matches no rows (guard keeps the original consent timestamp)', async () => {
  const before = (await row(A))?.adult_attested_at;
  const { data, error } = await firstTime(A, new Date(Date.now() + 60_000).toISOString());
  expect(error).toBeNull();
  expect(data).toEqual([]);
  expect((await row(A))?.adult_attested_at).toBe(before);
});

test('an edit leaves adult_attested_at unchanged', async () => {
  const before = (await row(A))?.adult_attested_at;
  const { data, error } = await A.client.from('profiles')
    .update({ first_language: 'tl', study_minutes_per_day: 30, preferences: { font: 'dyslexic', reduced_motion: true } })
    .eq('user_id', A.userId).select('user_id');
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(await row(A)).toMatchObject({ adult_attested_at: before, first_language: 'tl', study_minutes_per_day: 30 });
});

test('onboarded_at without adult_attested_at is rejected', async () => {
  const { error } = await B.client.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', B.userId);
  expect(error?.code).toBe('23514');
  expect((await row(B))?.onboarded_at).toBeNull();
});
