import { growthProfile, type EssayItems } from './profile';

/** D3.1 step 2: labels of the student's top 3 recurring patterns, from essays other than the one being checked. */
export function recurringFor(essays: EssayItems[], essayId: string): string[] {
  return growthProfile(essays.filter((e) => e.essayId !== essayId)).recurring.slice(0, 3).map((p) => p.label);
}
