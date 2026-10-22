import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { adminClient, createTestUser, deleteTestUsers, type Client } from './helpers';

const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }));
vi.mock('@/lib/profile/require', () => ({ requireOnboardedUser: async () => ({ userId: 'x', profile: {} }) }));
const { default: ProgressPage } = await import('@/app/(app)/progress/page');

let A: { client: Client; userId: string };
const created: string[] = [];
beforeAll(async () => { A = await createTestUser(); created.push(A.userId); });
afterAll(async () => { await deleteTestUsers(created); });

type ViewProps = { leech: number | null; hint: number | null };
// The page returns <AppPage><ProgressView …/></AppPage>; read the view's props without rendering.
const viewProps = async () => ((await ProgressPage()) as { props: { children: { props: ViewProps } } }).props.children.props;

test('Progress counts leeches and opened hints from the database', async () => {
  const admin = adminClient();
  const deck = (await admin.from('decks').insert({ user_id: A.userId, title: 'D' }).select('id').single()).data!.id;
  const card = (status: string) => ({ user_id: A.userId, deck_id: deck, type: 'basic', front: 'F', back: 'B', source_quote: 'q', concept: 'c',
    bloom_level: 'remember', importance: 2, status });
  const ids = (await admin.from('cards').insert([card('kept'), card('kept'), card('kept'), card('kept'), card('suspended')]).select('id')).data!.map((c) => c.id);
  const st = (id: string, lapses: number) => ({ card_id: id, user_id: A.userId, due: new Date().toISOString(), stability: 1, difficulty: 5,
    scheduled_days: 1, learning_steps: 0, reps: 1, lapses, state: 2, last_review: new Date().toISOString() });
  const { error } = await admin.from('card_states').insert([st(ids[0], 5), st(ids[1], 0), st(ids[2], 1), st(ids[3], 4), st(ids[4], 9)]);
  if (error) throw error;
  session.client = A.client;
  const p = await viewProps();
  expect(p.leech).toBe(50); // 2 of 4 kept cards; the suspended leech doesn't count
  expect(p.hint).toBeNull();
});
