import { safeNext } from '@/lib/auth/paths';
import { isDemo } from '@/lib/demo/accounts';
import { DemoStart } from './demo-start';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Deskmate' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string; demo?: string }> }) {
  const { next, error, deleted, demo } = await searchParams;
  if (isDemo()) return <DemoStart error={demo} />;
  return (
    <LoginForm
      next={safeNext(next)}
      initialError={error === 'callback' ? "We couldn't finish signing you in. Try again." : undefined}
      notice={deleted === '1' ? 'Your Deskmate data was deleted.' : undefined}
    />
  );
}
