import { userTimeZone } from '@/lib/time/user-zone';
import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { conceptMastery, forgettingCurve } from '@/review/mastery';
import { remediation } from '@/review/prereqs';
import { MasteryView, type MasterySection } from './mastery-view';

export default async function MasteryPage() {
  await requireOnboardedUser();
  // loadStudy returns kept cards only, so suspended cards stay off the map
  const zone = await userTimeZone();
  const db = await createClient();
  const [{ decks, cards }, edges] = await Promise.all([loadStudy(db, undefined, zone), db.from('concept_prereqs').select('deck_id,concept,prereq')]);
  if (edges.error) throw new Error("We couldn't load your cards.");
  const now = new Date();
  const concepts = conceptMastery(cards, now);
  const remedies = remediation(concepts, cards, edges.data.map((e) => ({ deckId: e.deck_id, concept: e.concept, prereq: e.prereq })));
  const sections: MasterySection[] = decks
    .map((deck) => ({ deck, concepts: concepts.filter((c) => c.deckId === deck.id), remedies: remedies.filter((r) => r.deckId === deck.id), curve: forgettingCurve(cards.filter((c) => c.deckId === deck.id), now, 30, zone) }))
    .filter((s) => s.concepts.length);
  return (
    <AppPage current="study" title="Mastery map">
      <MasteryView sections={sections} />
    </AppPage>
  );
}
