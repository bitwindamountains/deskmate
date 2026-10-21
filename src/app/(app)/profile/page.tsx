import Link from 'next/link';
import { AppPage } from '@/components/page';
import { SignOut } from '@/components/sign-out';
import { LANGUAGES } from '@/lib/profile/onboarding';
import { requireOnboardedUser } from '@/lib/profile/require';
import { createClient } from '@/lib/supabase/server';
import { calibration, type Confidence } from '@/review/calibration';

export default async function ProfilePage() {
  const { profile } = await requireOnboardedUser();
  const prefs = profile.preferences ?? {};
  // ponytail: the latest 500 rated answers are plenty for a stable score; widen if calibration moves to a stored profile (2c).
  const { data: rated } = await (await createClient()).from('reviews').select('confidence,final_rating')
    .not('confidence', 'is', null).order('reviewed_at', { ascending: false }).limit(500);
  const selfCheck = calibration((rated ?? []) as { confidence: Confidence; final_rating: number }[]);
  const lang = LANGUAGES.find(([c]) => c === profile.first_language)?.[1] ?? profile.first_language ?? 'Not set';
  const rows: [string, string][] = [
    ['First language', lang],
    ['Daily study time', `${profile.study_minutes_per_day} minutes`],
    ['Reading font', prefs.font === 'dyslexic' ? 'Dyslexia-friendly' : 'Standard'],
    ['Reduce motion', prefs.reduced_motion ? 'On' : 'Off'],
    ['Show rubric scores', prefs.show_scores === false ? 'Off' : 'On'],
    ['Self-check accuracy', selfCheck ? `${selfCheck.score}% (from ${selfCheck.n} answers)` : 'Answer with a confidence level 10 times to see this.'],
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
