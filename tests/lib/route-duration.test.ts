import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Every route that waits on an AI call sets its own time limit, so it doesn't depend on the Vercel dashboard setting.
const AI_ROUTES = ['cards/help', 'cards/improve', 'cards/rephrase', 'essays/analyze', 'essays/dialogue', 'essays/hint', 'feynman', 'generate', 'grade'];

test.each(AI_ROUTES)('/api/%s sets maxDuration to 60 seconds', (route) => {
  expect(readFileSync(`src/app/api/${route}/route.ts`, 'utf8')).toMatch(/^export const maxDuration = 60;/m);
});
