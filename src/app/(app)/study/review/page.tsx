import { userTimeZone } from '@/lib/time/user-zone';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { ReviewSession } from './session';
import { studySettings } from '@/review/schedule';

const conceptKey = (c: string) => c.trim().toLowerCase(); // same grouping as the mastery map

/** ?deck= (from triage) focuses the session on one deck; with &concept= (from the mastery map), on one concept of it. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ deck?: string; concept?: string }> }) {
  const { profile } = await requireOnboardedUser();
  const { deck, concept } = await searchParams;
  const { decks, cards, newIntroducedToday } = await loadStudy(await createClient(), undefined, await userTimeZone());
  const examDates = Object.fromEntries(decks.map((d) => [d.id, d.exam_date]));
  const focus = typeof concept === 'string' && concept.trim() ? conceptKey(concept) : null;
  const inDeck = typeof deck === 'string' && deck ? cards.filter((c) => c.deckId === deck) : cards;
  const shown = focus ? inDeck.filter((c) => conceptKey(c.concept) === focus) : inDeck;
  const label = focus ? shown[0]?.concept.trim() ?? concept!.trim() : decks.find((d) => d.id === deck)?.title ?? null;
  return (
    <AppPage current="study" title={label ? `Review: ${label}` : 'Review'}>
      <ReviewSession cards={shown} minutes={profile.study_minutes_per_day} newIntroducedToday={newIntroducedToday} examDates={examDates}
        {...studySettings(profile.preferences)} />
    </AppPage>
  );
}
