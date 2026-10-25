'use client';

import { useActionState } from 'react';
import { sendEmailCode, signInWithGoogle, verifyEmailCode, type LoginState } from './actions';

const input = 'field';
const button = 'btn';

export function LoginForm({ next, initialError, notice }: { next: string; initialError?: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    (prev, fd) => (prev.step === 'code' && fd.get('intent') !== 'resend' ? verifyEmailCode(prev, fd) : sendEmailCode(prev, fd)),
    { step: 'email', error: initialError },
  );

  const bad = state.error ? { 'aria-invalid': true, 'aria-describedby': 'login-err' } : {};

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <h1 className="hand rule-draw pb-1 text-[2.25rem] leading-tight text-balance">Sign in to Scholar</h1>
      {notice && <p role="status">{notice}</p>}
      {state.error && <p id="login-err" role="alert" className="error">{state.error}</p>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn btn-primary w-full">Continue with Google</button>
      </form>

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        {state.step === 'email' ? (
          <div>
            <label htmlFor="email" className="mb-1 block">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={input} {...bad} />
          </div>
        ) : (
          <>
            <p>We sent a code to {state.email}.</p>
            <input type="hidden" name="email" value={state.email} />
            <div>
              <label htmlFor="token" className="mb-1 block">Code from the email</label>
              <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required className={input} {...bad} />
            </div>
          </>
        )}
        <button type="submit" disabled={pending} className={`${button} w-full`}>
          {state.step === 'email' ? 'Email me a code' : 'Verify code'}
        </button>
        {state.step === 'code' && (
          <button type="submit" name="intent" value="resend" formNoValidate disabled={pending} className="min-h-11 underline">
            Send a new code
          </button>
        )}
      </form>

      <p className="text-sm text-ink-muted"><a href="/privacy" className="underline">How Scholar handles your data</a></p>
    </main>
  );
}
