import { AppPage } from '@/components/page';
import { hintReliance, leechRate, sharedCalibration, writingCalibration } from '@/growth/learner';
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
  // ponytail: the latest 500 rated answers and every item/card row; store a profile table if these grow large.
  const [growth, rated, selfRows, items, states] = await Promise.all([
    loadGrowth(db),
    db.from('reviews').select('confidence,final_rating').not('confidence', 'is', null).order('reviewed_at', { ascending: false }).limit(500),
    db.from('self_assessments').select('scores,drafts!inner(analyses(rubric_scores))'),
    db.from('feedback_items').select('highest_level'),
    db.from('card_states').select('lapses,cards!inner(status)').eq('cards.status', 'kept'),
  ]);
  if (rated.error || selfRows.error || items.error || states.error) throw new Error(LOAD_FAILED);

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
        hint={hintReliance(items.data.map((i) => i.highest_level as number))} leech={leechRate(states.data.map((s) => s.lapses as number))} />
    </AppPage>
  );
}
