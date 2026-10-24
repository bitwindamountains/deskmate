import { userTimeZone } from '@/lib/time/user-zone';
import { AppPage } from '@/components/page';
import { essaysWithOpenPriorities } from '@/lib/essay/summary';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { TodayPlan } from './plan';

export default async function TodayPage() {
  const { profile } = await requireOnboardedUser();
  const db = await createClient();
  const zone = await userTimeZone();
  const [{ decks, cards, newIntroducedToday }, essays] = await Promise.all([loadStudy(db, undefined, zone), essaysWithOpenPriorities(db)]);
  return (
    <AppPage current="today" title="Today">
      <TodayPlan decks={decks} cards={cards} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} now={new Date()} essays={essays} zone={zone}
        newLimit={profile.preferences?.new_cards_per_day} />
    </AppPage>
  );
}
