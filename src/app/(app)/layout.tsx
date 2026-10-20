import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import { requireOnboardedUser } from '@/lib/profile/require';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireOnboardedUser();
  const prefs = profile.preferences ?? {};
  return (
    <div
      data-font={prefs.font === 'dyslexic' ? 'dyslexic' : 'default'}
      data-reduced-motion={prefs.reduced_motion ? 'true' : 'false'}
      className="min-h-dvh md:flex"
    >
      <a href="#main" className="sr-only z-20 rounded-lg bg-mark px-4 py-3 font-bold text-on-mark focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      {children}
    </div>
  );
}
