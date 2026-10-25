import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { loadStudy } from '@/lib/review/load';
import { createClient } from '@/lib/supabase/server';
import { WarmUp } from './warm-up';

export default async function WarmUpPage() {
  await requireOnboardedUser();
  const { cards } = await loadStudy(await createClient());
  return (
    <AppPage current="study" title="Warm-up">
      <p className="mb-6 max-w-prose text-ink-muted">A few quick questions to get going. They don&apos;t change when your cards come up.</p>
      <WarmUp cards={cards} seed={Date.now()} />
    </AppPage>
  );
}
