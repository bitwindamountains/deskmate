import { safeNext } from '@/lib/auth/paths';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={safeNext(next)}
      initialError={error === 'callback' ? "We couldn't finish signing you in. Try again." : undefined}
    />
  );
}
