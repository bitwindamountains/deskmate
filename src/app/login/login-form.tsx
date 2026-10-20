'use client';

import { useActionState } from 'react';
import { sendEmailCode, signInWithGoogle, verifyEmailCode, type LoginState } from './actions';

const input = 'field';
const button = 'btn';

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    (prev, fd) => (prev.step === 'code' && fd.get('intent') !== 'resend' ? verifyEmailCode(prev, fd) : sendEmailCode(prev, fd)),
    { step: 'email', error: initialError },
  );

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in to Scholar</h1>
      {state.error && <p role="alert" className="error">{state.error}</p>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn btn-primary w-full">Continue with Google</button>
      </form>

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        {state.step === 'email' ? (
          <div>
            <label htmlFor="email" className="mb-1 block">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={input} />
          </div>
        ) : (
          <>
            <p>We sent a code to {state.email}.</p>
            <input type="hidden" name="email" value={state.email} />
            <div>
              <label htmlFor="token" className="mb-1 block">6-digit code</label>
              <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={input} />
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
    </main>
  );
}
