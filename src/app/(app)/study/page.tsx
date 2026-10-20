import { AppPage } from '@/components/page';
import { EmptyStudy } from '@/components/empty-study';

export default function StudyPage() {
  return (
    <AppPage current="study" title="Study">
      <section aria-labelledby="decks">
        <h2 id="decks" className="mb-4 text-[1.44rem] font-bold">Your decks</h2>
        {/* ponytail: deck list arrives with plan 1a-2; until then there are never decks. */}
        <EmptyStudy level={3} />
      </section>
    </AppPage>
  );
}
