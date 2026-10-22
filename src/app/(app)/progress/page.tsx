import { AppPage } from '@/components/page';
import { hintReliance, LEECH_LAPSES, leechRate, sharedCalibration, writingCalibration } from '@/growth/learner';
import { growthProfile } from '@/growth/profile';
import type { SelfScore } from '@/lib/essay/self-check';
import { loadGrowth } from '@/lib/growth/load';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { calibration, type Confidence } from '@/review/calibration';
import { ProgressView } from './progress-view';

const LOAD_FAILED = "We couldn't load your progress.";

// One learner profile (C2), computed on load from both tools; nothing is stored.
export default async function ProgressPage() {
  await requireOnboardedUser();
  const db = await createClient();
  // ponytail: latest 500 rated answers and latest 1,000 opened hints; store a profile table if a student outgrows them.
  const studied = () => db.from('card_states').select('card_id,cards!inner(status)', { count: 'exact', head: true }).eq('cards.status', 'kept');
  const [growth, rated, selfRows, items, studiedCount, leechCount] = await Promise.all([
    loadGrowth(db),
    db.from('reviews').select('confidence,final_rating').not('confidence', 'is', null).order('reviewed_at', { ascending: false }).limit(500),
    db.from('self_assessments').select('scores,drafts!inner(analyses(rubric_scores))'),
    db.from('feedback_items').select('highest_level').gt('highest_level', 0).order('created_at', { ascending: false }).limit(1000),
    // Exact counts are computed by the database, so they aren't cut at the API's row cap.
    studied(),
    studied().gte('lapses', LEECH_LAPSES),
  ]);
  if (rated.error || selfRows.error || items.error || studiedCount.error || leechCount.error) throw new Error(LOAD_FAILED);

  const recall = calibration(rated.data as { confidence: Confidence; final_rating: number }[]);
  type SelfRow = { scores: SelfScore[]; drafts: { analyses: { rubric_scores: SelfScore[] } | { rubric_scores: SelfScore[] }[] | null } };
  const writing = writingCalibration((selfRows.data as unknown as SelfRow[]).flatMap((r) => {
    const a = Array.isArray(r.drafts.analyses) ? r.drafts.analyses[0] : r.drafts.analyses;
    return a ? [{ self: r.scores, ai: a.rubric_scores }] : []; // no feedback yet: nothing to compare
  }));
  return (
    <AppPage current="progress" title="Progress">
      <ProgressView growth={growthProfile(growth)} calibration={sharedCalibration(recall, writing)}
        counts={{ answers: recall?.n ?? 0, criteria: writing?.of ?? 0 }}
        hint={hintReliance(items.data.map((i) => i.highest_level as number))} leech={leechRate(leechCount.count ?? 0, studiedCount.count ?? 0)} />
    </AppPage>
  );
}
