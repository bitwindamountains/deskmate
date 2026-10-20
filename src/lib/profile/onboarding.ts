import { z } from 'zod';

export const ADULT_ERROR = "Scholar's beta is for adults (18+) for now.";
export const LANGUAGES = [['en', 'English'], ['fil', 'Filipino'], ['es', 'Spanish'], ['other', 'Other']] as const;

export const OnboardingInput = z.object({
  adult: z.literal(true, { error: ADULT_ERROR }),
  first_language: z.string().trim().min(1, 'Choose or enter your first language.').max(60, 'Keep it under 60 characters.'),
  study_minutes_per_day: z.number({ error: 'Enter a number from 5 to 120.' }).int('Enter a whole number.').min(5, 'Enter at least 5 minutes.').max(120, 'Enter at most 120 minutes.'),
  font: z.enum(['default', 'dyslexic'], { error: 'Choose a reading font.' }),
  reduced_motion: z.boolean(),
});

const str = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string).trim() : '');

export function parseOnboarding(fd: FormData):
  | { ok: true; value: z.infer<typeof OnboardingInput> }
  | { ok: false; errors: Record<string, string> } {
  const lang = str(fd, 'first_language');
  const minutes = str(fd, 'study_minutes_per_day');
  const r = OnboardingInput.safeParse({
    adult: fd.get('adult') === 'on',
    first_language: lang === 'other' ? str(fd, 'first_language_other') : lang,
    study_minutes_per_day: minutes === '' ? 20 : Number(minutes),
    font: str(fd, 'font') || 'default',
    reduced_motion: fd.get('reduced_motion') === 'on',
  });
  if (r.success) return { ok: true, value: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  // the free-text box is where an "Other" error belongs
  if (lang === 'other' && errors.first_language) {
    errors.first_language_other = errors.first_language;
    delete errors.first_language;
  }
  return { ok: false, errors };
}
