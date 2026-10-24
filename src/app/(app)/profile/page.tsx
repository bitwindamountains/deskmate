import Link from 'next/link';
import { AppPage } from '@/components/page';
import { SignOut } from '@/components/sign-out';
import { requireOnboardedUser } from '@/lib/profile/require';
import { studySettings } from '@/review/schedule';
import { YourData } from './your-data';

export default async function ProfilePage() {
  const { profile } = await requireOnboardedUser();
  const prefs = profile.preferences ?? {};
  const study = studySettings(prefs);
  const rows: [string, string][] = [
    ['Daily study time', `${profile.study_minutes_per_day} minutes`],
    ['New cards a day', String(study.newLimit)],
    ['Target retention', `${Math.round(study.retention * 100)}%`],
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
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/onboarding?edit=1" className="btn">Change preferences</Link>
          {/* Self-check accuracy moved to Progress, which covers both tools (C2). */}
          <Link href="/progress" className="btn">See your progress</Link>
        </div>
      </section>
      <YourData />
      <SignOut />
    </AppPage>
  );
}
