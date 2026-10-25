'use client';

import { useActionState } from 'react';
import { CassetteHero } from '@/components/cassette';
import type { Profile } from '@/lib/profile/require';
import { completeOnboarding, type OnboardingState } from './actions';

const input = 'field';

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="error mt-1">{msg}</p> : null;
}

export function OnboardingForm({ defaults }: { defaults?: Profile }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const e = state.errors ?? {};
  const font = defaults?.preferences?.font ?? 'default';
  const bad = (k: string) => (e[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10">
      <CassetteHero />
      <h1 className="hand rule-draw pb-1 text-[2.25rem] leading-tight text-balance"><span className="hand-write">Set up Scholar</span></h1>
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
          <label htmlFor="study_minutes_per_day" className="mb-1 block">How many minutes a day can you study?</label>
          <input id="study_minutes_per_day" name="study_minutes_per_day" type="number" min={5} max={120} defaultValue={defaults?.study_minutes_per_day ?? 20} className={input} {...bad('study_minutes_per_day')} />
          <Err id="study_minutes_per_day-err" msg={e.study_minutes_per_day} />
        </div>
        <div>
          <label htmlFor="new_cards_per_day" className="mb-1 block">New cards a day</label>
          <input id="new_cards_per_day" name="new_cards_per_day" type="number" min={5} max={100}
            defaultValue={defaults?.preferences?.new_cards_per_day ?? 20} className={input} {...bad('new_cards_per_day')} />
          <Err id="new_cards_per_day-err" msg={e.new_cards_per_day} />
        </div>
        <div>
          <label htmlFor="retention_percent" className="mb-1 block">How much do you want to remember? (80 to 97%)</label>
          <input id="retention_percent" name="retention_percent" type="number" min={80} max={97}
            defaultValue={Math.round((defaults?.preferences?.retention ?? 0.9) * 100)} className={input} {...bad('retention_percent')}
            aria-describedby={e.retention_percent ? 'retention_percent-err' : 'retention_percent-help'} />
          <p id="retention_percent-help" className="mt-1 text-sm text-ink-muted">Higher means more reviews. 90% suits most students.</p>
          <Err id="retention_percent-err" msg={e.retention_percent} />
        </div>

        <fieldset>
          <legend className="mb-1">Reading font</legend>
          <label className="mr-4 inline-flex min-h-11 items-center gap-2"><input type="radio" name="font" value="default" defaultChecked={font === 'default'} /> Standard</label>
          <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="font" value="dyslexic" defaultChecked={font === 'dyslexic'} /> Dyslexia-friendly</label>
        </fieldset>

        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="reduced_motion" defaultChecked={defaults?.preferences?.reduced_motion ?? false} /> Reduce motion
        </label>

        <label className="flex min-h-11 items-center gap-2">
          {/* missing means on: profiles saved before this option existed keep seeing scores */}
          <input type="checkbox" name="show_scores" defaultChecked={defaults?.preferences?.show_scores ?? true} /> Show rubric scores
        </label>

        {/* ponytail: this sentence names every service that receives student text: the `trainsOnInputs: false` providers in
            src/llm/config.ts and LanguageTool (src/lib/essay/languagetool.ts). Update it with either. Confirm LanguageTool's
            privacy terms before launch. */}
        <p>Scholar uses AI to make flashcards, check your answers, and give essay feedback. Your text is sent to Groq for this, and essays are also checked by LanguageTool for spelling and grammar. Groq&apos;s terms say it does not train its models on what you send. <a href="/privacy" className="underline">Read the privacy notice</a>.</p>

        <button type="submit" disabled={pending} className="btn btn-primary">{defaults ? 'Save changes' : 'Start studying'}</button>
      </form>
    </main>
  );
}
