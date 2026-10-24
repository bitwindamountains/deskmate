import { userTimeZone } from '@/lib/time/user-zone';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { ReviewSession } from './session';

const conceptKey = (c: string) => c.trim().toLowerCase(); // same grouping as the mastery map

/** ?deck=&concept= (from the mastery map) focuses the session on one concept of one deck. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ deck?: string; concept?: string }> }) {
  const { profile } = await requireOnboardedUser();
  const { deck, concept } = await searchParams;
  const { decks, cards, newIntroducedToday } = await loadStudy(await createClient(), undefined, await userTimeZone());
  const examDates = Object.fromEntries(decks.map((d) => [d.id, d.exam_date]));
  const focus = typeof concept === 'string' && concept.trim() ? conceptKey(concept) : null;
  const shown = focus ? cards.filter((c) => conceptKey(c.concept) === focus && (!deck || c.deckId === deck)) : cards;
  const label = focus ? shown[0]?.concept.trim() ?? concept!.trim() : null;
  return (
    <AppPage current="study" title={label ? `Review: ${label}` : 'Review'}>
      <ReviewSession cards={shown} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} examDates={examDates}
        newLimit={profile.preferences?.new_cards_per_day} retention={profile.preferences?.retention} />
    </AppPage>
  );
}
