const MAX = 3;
const why = (front: string) => `Explain in one paragraph (at least 50 words): ${front}`;
const concept = (c: string) => `Explain in one paragraph (at least 50 words) how ${c} works, using what you studied.`;

/** Flashcards → essay prompts (C1): "why" cards first, else one prompt per distinct concept. Draft Coach checks the answer. */
export function essayPrompts(cards: { type: string; front: string; concept: string }[]): string[] {
  const whys = cards.filter((c) => c.type === 'why').map((c) => why(c.front));
  if (whys.length) return whys.slice(0, MAX);
  const seen = new Map<string, string>();
  for (const c of cards) if (c.concept.trim() && !seen.has(c.concept.trim().toLowerCase())) seen.set(c.concept.trim().toLowerCase(), c.concept.trim());
  return [...seen.values()].slice(0, MAX).map(concept);
}

export const promptForWhy = why;

/** A link to the new-essay form with its title and assignment prompt filled in. */
export const writeHref = (title: string, prompt: string) => `/write/new?${new URLSearchParams({ title, prompt })}`;
