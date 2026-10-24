import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { generationsLeft } from '@/lib/generate/generate-chunk';
import { createClient } from '@/lib/supabase/server';
import { ImportForm } from './import-form';

export default async function ImportPage() {
  await requireOnboardedUser();
  const supabase = await createClient();
  const [{ data }, left] = await Promise.all([supabase.from('decks').select('id,title').order('title'), generationsLeft(supabase).catch(() => null)]);
  return (
    <AppPage current="study" title="Import material">
      <ImportForm decks={data ?? []} generationsLeft={left} />
    </AppPage>
  );
}
