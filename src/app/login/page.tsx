import { safeNext } from '@/lib/auth/paths';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { next, error, deleted } = await searchParams;
  return (
    <LoginForm
      next={safeNext(next)}
      initialError={error === 'callback' ? "We couldn't finish signing you in. Try again." : undefined}
      notice={deleted === '1' ? 'Your Scholar data was deleted.' : undefined}
    />
  );
}
