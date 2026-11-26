'use client';

import { useActionState, useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/auth/password';
import { sendPasswordReset, signInWithGoogle, signInWithPassword, signUpWithPassword, type LoginMode, type LoginState } from './actions';

const TITLE: Record<LoginMode, string> = { signin: 'Sign in to Deskmate', signup: 'Create your account', forgot: 'Reset your password' };
const SUBMIT: Record<LoginMode, string> = { signin: 'Sign in', signup: 'Create account', forgot: 'Email me a reset link' };
const ACTION = { signin: signInWithPassword, signup: signUpWithPassword, forgot: sendPasswordReset };
const modeOf = (fd: FormData): LoginMode => (fd.get('mode') === 'signup' ? 'signup' : fd.get('mode') === 'forgot' ? 'forgot' : 'signin');

export function LoginForm({ next, initialError, notice }: { next: string; initialError?: string; notice?: string }) {
  const [mode, setMode] = useState<LoginMode>('signin');
  const [state, action, pending] = useActionState<LoginState, FormData>((prev, fd) => ACTION[modeOf(fd)](prev, fd), { mode: 'signin', error: initialError });
  // A result belongs to the form that produced it; switching forms starts clean.
  const shown = state.mode === mode ? state : { mode };
  const bad = shown.error ? { 'aria-invalid': true, 'aria-describedby': 'login-err' } : {};
  const sent = shown.sent && (mode === 'signup'
    ? `Check your email: open the link we sent to ${shown.email} to finish creating your account. Then you can sign in with your password.`
    : `If ${shown.email} has a Deskmate account, we sent it a link to set a new password.`);

  return (
    <div className="space-y-5">
      <h2 key={mode} className="hand text-2xl leading-tight">{TITLE[mode]}</h2>
      {notice && <p role="status">{notice}</p>}
      {shown.error && <p id="login-err" role="alert" className="error">{shown.error}</p>}

      {mode === 'signin' && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-primary w-full">Continue with Google</button>
        </form>
      )}

      {sent ? <p role="status" className="inlay card-in p-4">{sent}</p> : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="mode" value={mode} />
          <div>
            <label htmlFor="email" className="mb-1 block">Email</label>
            <input id="email" name="email" type="email" autoComplete={mode === 'signup' ? 'email' : 'username'} required
              defaultValue={shown.email} className="field" {...bad} />
          </div>
          {mode !== 'forgot' && (
            <div>
              <label htmlFor="password" className="mb-1 block">Password</label>
              <input id="password" name="password" type="password" required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? PASSWORD_MIN : undefined} maxLength={PASSWORD_MAX}
                aria-invalid={shown.error ? true : undefined}
                aria-describedby={[mode === 'signup' && 'password-hint', shown.error && 'login-err'].filter(Boolean).join(' ') || undefined} className="field" />
              {mode === 'signup' && <p id="password-hint" className="mt-1 text-sm text-ink-muted">{`At least ${PASSWORD_MIN} characters.`}</p>}
            </div>
          )}
          <button type="submit" disabled={pending} className={`btn w-full ${mode === 'signin' ? '' : 'btn-primary'}`}>{SUBMIT[mode]}</button>
        </form>
      )}

      <p className="flex flex-wrap gap-x-5 gap-y-1">
        {mode !== 'signin' && <button type="button" className="min-h-11 underline" onClick={() => setMode('signin')}>Back to sign in</button>}
        {mode === 'signin' && <button type="button" className="min-h-11 underline" onClick={() => setMode('signup')}>Create an account</button>}
        {mode === 'signin' && <button type="button" className="min-h-11 underline" onClick={() => setMode('forgot')}>Forgot your password?</button>}
      </p>

      <p className="text-sm text-ink-muted"><a href="/privacy" className="underline">How Deskmate handles your data</a></p>
    </div>
  );
}
