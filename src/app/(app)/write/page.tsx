import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { EssayList, essayStatus } from './essays';

type EssayRow = { id: string; title: string; drafts: { version: number; layers: Record<string, string> | null }[] };

export default async function WritePage() {
  await requireOnboardedUser();
  const db = await createClient();
  const { data, error } = await db.from('essays').select('id,title,drafts(version,layers)').order('created_at', { ascending: false });
  if (error) throw new Error("We couldn't load your essays.");
  const essays = (data as unknown as EssayRow[]).map((e) => ({ id: e.id, title: e.title, status: essayStatus(e.drafts ?? []) }));
  return (
    <AppPage current="write" title="Write">
      <EssayList essays={essays} />
    </AppPage>
  );
}
