'use client';

import { useActionState } from 'react';
import { CassetteHero } from '@/components/cassette';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/auth/password';
import { updatePassword } from '../login/actions';

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {});
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <CassetteHero />
      <h1 className="hand rule-draw pb-1 text-[2.25rem] leading-tight text-balance"><span className="hand-write">Choose a new password</span></h1>
      {state.error && <p id="reset-err" role="alert" className="error">{state.error}</p>}
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="password" className="mb-1 block">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
            aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? 'password-hint reset-err' : 'password-hint'} className="field" />
          <p id="password-hint" className="mt-1 text-sm text-ink-muted">{`At least ${PASSWORD_MIN} characters.`}</p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary w-full">Save password</button>
      </form>
    </main>
  );
}
