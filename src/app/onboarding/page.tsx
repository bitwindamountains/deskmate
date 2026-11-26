import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/profile/require';
import { OnboardingForm } from './onboarding-form';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  return { title: (await searchParams).edit === '1' ? 'Your preferences · Scholar' : 'Set up · Scholar' };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { profile } = await getProfile();
  const editing = edit === '1';
  if (profile?.onboarded_at && !editing) redirect('/today');
  return <OnboardingForm defaults={editing ? profile ?? undefined : undefined} />;
}
