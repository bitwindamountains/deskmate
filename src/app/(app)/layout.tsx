import { userTimeZone } from '@/lib/time/user-zone';
import { TimeZoneCookie } from '@/components/time-zone-cookie';
import { CardStackGround } from '@/components/card-stack';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import { requireOnboardedUser } from '@/lib/profile/require';
import { isDemo } from '@/lib/demo/accounts';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOnboardedUser();
  const prefs = profile.preferences ?? {};
  const zone = await userTimeZone();
  return (<>
    {isDemo() && (
      <div role="note" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-2 text-sm">
        <span>Demo account with sample data. AI features are off, and this account is deleted after a day.</span>
        <form method="post" action="/api/demo"><button type="submit" className="min-h-11 underline">Start over</button></form>
      </div>
    )}
    <div
      data-font={prefs.font === 'dyslexic' ? 'dyslexic' : 'default'}
      data-reduced-motion={prefs.reduced_motion ? 'true' : 'false'}
      className="min-h-dvh md:flex"
    >
      <a href="#main" className="sr-only z-20 rounded-lg bg-mark px-4 py-3 font-bold text-on-mark focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <TimeZoneCookie serverZone={zone} />
      <CardStackGround />
      {children}
    </div>
  </>);
}
