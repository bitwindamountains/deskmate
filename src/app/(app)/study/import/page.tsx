import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { ImportForm } from './import-form';

export default async function ImportPage() {
  await requireOnboardedUser();
  const supabase = await createClient();
  const { data } = await supabase.from('decks').select('id,title').order('title');
  return (
    <AppPage current="study" title="Import material">
      <ImportForm decks={data ?? []} />
    </AppPage>
  );
}
