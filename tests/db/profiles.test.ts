import { afterAll, beforeAll, expect, test } from 'vitest';
import { anonClient, createTestUser, deleteTestUsers, type Client } from './helpers';

type User = { client: Client; userId: string };
let A: User;
let B: User;
const created: string[] = [];

// The same call getProfile makes on a user's first visit.
const firstVisit = (u: User) =>
  u.client.from('profiles').upsert({ user_id: u.userId }, { onConflict: 'user_id', ignoreDuplicates: true });

beforeAll(async () => {
  A = await createTestUser(); created.push(A.userId);
  B = await createTestUser(); created.push(B.userId);
});

afterAll(async () => {
  // Only the users this file created; their profile rows go with them via the FK cascade.
  await deleteTestUsers(created);
});

test('first getProfile creates an empty profile', async () => {
  expect((await firstVisit(A)).error).toBeNull();
  expect((await firstVisit(A)).error).toBeNull(); // a repeat visit is a no-op, not an error
  const { data } = await A.client.from('profiles').select('*').single();
  expect(data).toMatchObject({ user_id: A.userId, onboarded_at: null, adult_attested_at: null, study_minutes_per_day: 20, preferences: {} });
});

test('a user cannot insert a profile for another user_id', async () => {
  const { error } = await A.client.from('profiles').insert({ user_id: B.userId });
  expect(error?.code).toBe('42501');
});

test('a user cannot insert a pre-attested row', async () => {
  const now = new Date().toISOString();
  const { error } = await B.client.from('profiles').insert({ user_id: B.userId, adult_attested_at: now, onboarded_at: now });
  expect(error?.code).toBe('42501');
  expect((await firstVisit(B)).error).toBeNull();
});

test('a user cannot read another user profile', async () => {
  const { data, error } = await A.client.from('profiles').select('*').eq('user_id', B.userId);
  expect(error).toBeNull();
  expect(data).toEqual([]);
});

test('a user cannot update another user profile', async () => {
  const { data } = await A.client.from('profiles').update({ display_name: 'x' }).eq('user_id', B.userId).select();
  expect(data).toEqual([]);
  const { data: b } = await B.client.from('profiles').select('display_name').single();
  expect(b?.display_name).toBeNull();
});

test('a user cannot move their row to another user_id', async () => {
  const { error } = await A.client.from('profiles').update({ user_id: B.userId }).eq('user_id', A.userId);
  expect(error?.code).toBe('42501');
});

test('study_minutes_per_day outside 5..120 is rejected', async () => {
  for (const v of [4, 121]) {
    const { error } = await A.client.from('profiles').update({ study_minutes_per_day: v }).eq('user_id', A.userId);
    expect(error?.code).toBe('23514');
  }
  const { error } = await A.client.from('profiles').update({ study_minutes_per_day: 120 }).eq('user_id', A.userId);
  expect(error).toBeNull();
});

test('onboarding without the 18+ attestation is rejected', async () => {
  const { error } = await A.client.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', A.userId);
  expect(error?.code).toBe('23514');
});

test('first_language longer than 60 chars is rejected', async () => {
  const { error } = await A.client.from('profiles').update({ first_language: 'x'.repeat(61) }).eq('user_id', A.userId);
  expect(error?.code).toBe('23514');
});

test('anon cannot read profiles', async () => {
  const { data, error } = await anonClient().from('profiles').select('*');
  expect(error?.code).toBe('42501');
  expect(data).toBeNull();
});
