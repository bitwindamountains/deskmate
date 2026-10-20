'use client';

import { useActionState } from 'react';
import { LANGUAGES } from '@/lib/profile/onboarding';
import type { Profile } from '@/lib/profile/require';
import { completeOnboarding, type OnboardingState } from './actions';

const input = 'field';

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="error mt-1">{msg}</p> : null;
}

export function OnboardingForm({ defaults }: { defaults?: Profile }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const e = state.errors ?? {};
  const known = LANGUAGES.some(([c]) => c === defaults?.first_language);
  const lang = defaults?.first_language ? (known ? defaults.first_language : 'other') : '';
  const font = defaults?.preferences?.font ?? 'default';
  const bad = (k: string) => (e[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Set up Scholar</h1>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <form action={action} className="space-y-5">
        {!defaults && (
          <div>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="adult" required {...bad('adult')} /> I am 18 or older.
            </label>
            <Err id="adult-err" msg={e.adult} />
          </div>
        )}

        <div>
          <label htmlFor="first_language" className="mb-1 block">Your first language</label>
          <select id="first_language" name="first_language" required defaultValue={lang} className={input} {...bad('first_language')}>
            <option value="" disabled>Choose a language</option>
            {LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          <Err id="first_language-err" msg={e.first_language} />
          <label htmlFor="first_language_other" className="mb-1 mt-2 block">If Other, which language?</label>
          <input id="first_language_other" name="first_language_other" defaultValue={lang === 'other' ? defaults?.first_language ?? '' : ''} className={input} {...bad('first_language_other')} />
          <Err id="first_language_other-err" msg={e.first_language_other} />
        </div>

        <div>
          <label htmlFor="study_minutes_per_day" className="mb-1 block">How many minutes a day can you study?</label>
          <input id="study_minutes_per_day" name="study_minutes_per_day" type="number" min={5} max={120} defaultValue={defaults?.study_minutes_per_day ?? 20} className={input} {...bad('study_minutes_per_day')} />
          <Err id="study_minutes_per_day-err" msg={e.study_minutes_per_day} />
        </div>

        <fieldset>
          <legend className="mb-1">Reading font</legend>
          <label className="mr-4 inline-flex min-h-11 items-center gap-2"><input type="radio" name="font" value="default" defaultChecked={font === 'default'} /> Standard</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="font" value="dyslexic" defaultChecked={font === 'dyslexic'} /> Dyslexia-friendly</label>
        </fieldset>

        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="reduced_motion" defaultChecked={defaults?.preferences?.reduced_motion ?? false} /> Reduce motion
        </label>

        {/* ponytail: this sentence is tied to the `trainsOnInputs: false` providers in src/llm/config.ts; update both together. */}
        <p>Scholar uses AI to make flashcards and check your answers. Your study material is sent to Groq to do this. Groq&apos;s terms say it does not train its models on what you send.</p>

        <button type="submit" disabled={pending} className="btn btn-primary">{defaults ? 'Save changes' : 'Start studying'}</button>
      </form>
    </main>
  );
}
