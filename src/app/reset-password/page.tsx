import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './reset-form';

// Reached from the reset email through /auth/callback, which signs the student in first.
export default async function ResetPasswordPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <ResetPasswordForm />;
}
