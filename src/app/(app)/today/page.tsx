import { userTimeZone } from '@/lib/time/user-zone';
import { AppPage } from '@/components/page';
import { essaysWithOpenPriorities } from '@/lib/essay/summary';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { allRows } from '@/lib/cards/transfer';
import { createClient } from '@/lib/supabase/server';
import { TodayPlan } from './plan';
import { WeekActivity, weekActivity } from './week-activity';
import { studySettings } from '@/review/schedule';

export default async function TodayPage() {
  const { profile } = await requireOnboardedUser();
  const db = await createClient();
  const zone = await userTimeZone();
  const now = new Date();
  const [{ decks, cards, newIntroducedToday }, essays, reviews] = await Promise.all([loadStudy(db, undefined, zone), essaysWithOpenPriorities(db),
    // Eight days back covers the oldest local day in any zone; RLS scopes it to the student.
    // Paged: a busy week can pass the API's 1,000-row cap, which would silently undercount.
    allRows<{ reviewed_at: string }>((from, to) => db.from('reviews').select('reviewed_at')
      .gte('reviewed_at', new Date(now.getTime() - 8 * 86_400_000).toISOString()).order('reviewed_at').range(from, to))]);
  return (
    <AppPage current="today" title="Today">
      <TodayPlan decks={decks} cards={cards} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} now={now} essays={essays} zone={zone}
        newLimit={studySettings(profile.preferences).newLimit} />
      {cards.length > 0 && (
        <div className="mt-8"><WeekActivity days={weekActivity((reviews ?? []).map((r) => r.reviewed_at), now, zone)} /></div>
      )}
    </AppPage>
  );
}
