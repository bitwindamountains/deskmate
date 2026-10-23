import { z } from 'zod';

export const ADULT_ERROR = "Scholar's beta is for adults (18+) for now.";

export const OnboardingInput = z.object({
  adult: z.literal(true, { error: ADULT_ERROR }),
  study_minutes_per_day: z.number({ error: 'Enter a number from 5 to 120.' }).int('Enter a whole number.').min(5, 'Enter at least 5 minutes.').max(120, 'Enter at most 120 minutes.'),
  font: z.enum(['default', 'dyslexic'], { error: 'Choose a reading font.' }),
  reduced_motion: z.boolean(),
  show_scores: z.boolean(),
});

const str = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string).trim() : '');

// requireAdult=false only when the profile already holds the original attestation (edit mode)
export function parseOnboarding(fd: FormData, { requireAdult = true } = {}):
  | { ok: true; value: z.infer<typeof OnboardingInput> }
  | { ok: false; errors: Record<string, string> } {
  const minutes = str(fd, 'study_minutes_per_day');
  const r = OnboardingInput.safeParse({
    adult: requireAdult ? fd.get('adult') === 'on' : true,
    study_minutes_per_day: minutes === '' ? 20 : Number(minutes),
    font: str(fd, 'font') || 'default',
    reduced_motion: fd.get('reduced_motion') === 'on',
    show_scores: fd.get('show_scores') === 'on',
  });
  if (r.success) return { ok: true, value: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  return { ok: false, errors };
}
