import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDemoAccount, isDemoUser } from '@/lib/demo/accounts';
import { DEMO_DECKS, DEMO_ESSAY } from '@/lib/demo/content';
import { isOnboarded } from '@/lib/profile/is-onboarded';
import { loadDeckSummaries, loadStudy } from '@/lib/review/load';
import { adminClient, deleteTestUser, type Client } from './helpers';

let client: Client;
let userId: string;

beforeAll(async () => {
  const { email, password } = await createDemoAccount();
  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: 'scholar' }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  userId = data.user.id;
}, 60_000);
afterAll(async () => { if (userId) await deleteTestUser(userId); });

test('the demo account is marked as one, so cleanup can find it', async () => {
  const { data } = await adminClient().auth.admin.getUserById(userId);
  expect(isDemoUser(data.user!)).toBe(true);
});

test('it is onboarded and its decks load as the student sees them', async () => {
  expect(await isOnboarded(client, userId)).toBe(true);
  const study = await loadStudy(client);
  expect(study.decks.map((d) => d.title)).toEqual(DEMO_DECKS.map((d) => d.title));
  const kept = DEMO_DECKS.flatMap((d) => d.cards).filter((c) => c.history !== null);
  expect(study.cards).toHaveLength(kept.length);
  expect(study.cards.filter((c) => c.state).length).toBe(kept.filter((c) => c.history!.length).length);
  const [biology] = await loadDeckSummaries(client);
  expect(biology.triage[0].pending).toBe(4);
});

test('its essay has finished feedback anchored in the text', async () => {
  const { data: drafts } = await client.from('drafts').select('id,content,layers,outline');
  expect(drafts).toHaveLength(1);
  expect(drafts![0].layers).toEqual({ global: 'done', paragraphs: 'done', sentences: 'done' });
  const { data: items } = await client.from('feedback_items').select('quote,anchor_start,anchor_end,paragraph_index');
  expect(items).toHaveLength(DEMO_ESSAY.items.length);
  const paras = (drafts![0].content as string).split(/\n\s*\n/);
  for (const i of items!) expect(paras[i.paragraph_index].slice(i.anchor_start, i.anchor_end)).toBe(i.quote);
  const { data: analysis } = await client.from('analyses').select('rubric_scores').single();
  expect((analysis!.rubric_scores as unknown[]).length).toBe(5);
});
