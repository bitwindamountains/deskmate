import { AppPage } from '@/components/page';
import { growthProfile, growthSnapshot } from '@/growth/profile';
import { essayChecksLeft } from '@/lib/essay/summary';
import { loadGrowth } from '@/lib/growth/load';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { EssayList, essayStatus } from './essays';

type EssayRow = { id: string; title: string; drafts: { version: number; layers: Record<string, string> | null }[] };

export default async function WritePage() {
  await requireOnboardedUser();
  const db = await createClient();
  const [{ data, error }, checksLeft, scores, growth] = await Promise.all([
    db.from('essays').select('id,title,drafts(version,layers)').order('created_at', { ascending: false }),
    essayChecksLeft(db),
    db.from('analyses').select('rubric_scores'),
    loadGrowth(db).catch(() => []), // a nicety: if it can't load, the page still shows the essays
  ]);
  if (error) throw new Error("We couldn't load your essays.");
  const essays = (data as unknown as EssayRow[]).map((e) => ({ id: e.id, title: e.title, status: essayStatus(e.drafts ?? []) }));
  return (
    <AppPage current="write" title="Write">
      <EssayList essays={essays} checksLeft={checksLeft}
        snapshot={growthSnapshot((scores.data ?? []).map((a) => (a.rubric_scores ?? []) as { criterion: string; score: number }[]),
          growthProfile(growth).recurring)} />
    </AppPage>
  );
}
