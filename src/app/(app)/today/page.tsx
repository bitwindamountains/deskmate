import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { TodayPlan } from './plan';

export default async function TodayPage() {
  const { profile } = await requireOnboardedUser();
  const { decks, cards, newIntroducedToday } = await loadStudy(await createClient());
  return (
    <AppPage current="today" title="Today">
      <TodayPlan decks={decks} cards={cards} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} now={new Date()} />
    </AppPage>
  );
}
