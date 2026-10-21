import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { ReviewSession } from './session';

export default async function ReviewPage() {
  const { profile } = await requireOnboardedUser();
  const { decks, cards, newIntroducedToday } = await loadStudy(await createClient());
  const examDates = Object.fromEntries(decks.map((d) => [d.id, d.exam_date]));
  return (
    <AppPage current="study" title="Review">
      <ReviewSession cards={cards} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} examDates={examDates} />
    </AppPage>
  );
}
