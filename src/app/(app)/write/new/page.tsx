import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { NewEssayForm } from './new-essay-form';

export default async function NewEssayPage() {
  await requireOnboardedUser();
  return (
    <AppPage current="write" title="New essay">
      <NewEssayForm />
    </AppPage>
  );
}
