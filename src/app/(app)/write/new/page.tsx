import { AppPage } from '@/components/page';
import { requireOnboardedUser } from '@/lib/profile/require';
import { NewEssayForm } from './new-essay-form';

// Prefill from a card or deck link; cut to the essays.title and assignment_prompt limits.
const param = (v: string | string[] | undefined, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function NewEssayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOnboardedUser();
  const q = await searchParams;
  return (
    <AppPage current="write" title="New essay">
      <NewEssayForm initialTitle={param(q.title, 120)} initialPrompt={param(q.prompt, 4000)} />
    </AppPage>
  );
}
