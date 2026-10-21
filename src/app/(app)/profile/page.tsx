import Link from 'next/link';
import { AppPage } from '@/components/page';
import { SignOut } from '@/components/sign-out';
import { LANGUAGES } from '@/lib/profile/onboarding';
import { requireOnboardedUser } from '@/lib/profile/require';

export default async function ProfilePage() {
  const { profile } = await requireOnboardedUser();
  const prefs = profile.preferences ?? {};
  const lang = LANGUAGES.find(([c]) => c === profile.first_language)?.[1] ?? profile.first_language ?? 'Not set';
  const rows: [string, string][] = [
    ['First language', lang],
    ['Daily study time', `${profile.study_minutes_per_day} minutes`],
    ['Reading font', prefs.font === 'dyslexic' ? 'Dyslexia-friendly' : 'Standard'],
    ['Reduce motion', prefs.reduced_motion ? 'On' : 'Off'],
    ['Show rubric scores', prefs.show_scores === false ? 'Off' : 'On'],
  ];
  return (
    <AppPage current="profile" title="Profile">
      <section aria-labelledby="prefs" className="max-w-prose rounded-xl border border-line bg-surface p-6">
        <h2 id="prefs" className="text-xl font-bold">Your preferences</h2>
        <dl className="mt-4 divide-y divide-line/40">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-4 py-3">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/onboarding?edit=1" className="btn mt-6">Change preferences</Link>
      </section>
      <SignOut />
    </AppPage>
  );
}
