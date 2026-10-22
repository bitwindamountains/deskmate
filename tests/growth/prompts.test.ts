import { expect, test } from 'vitest';
import { essayPrompts, writeHref } from '@/growth/prompts';

test('essayPrompts uses why cards first, falls back to distinct concepts, caps at 3, and is empty for no cards', () => {
  const why = (front: string) => ({ type: 'why', front, concept: 'c' });
  expect(essayPrompts([{ type: 'basic', front: 'B', concept: 'x' }, why('Why does ice float?')]))
    .toEqual(['Explain in one paragraph (at least 50 words): Why does ice float?']);
  expect(essayPrompts([why('1?'), why('2?'), why('3?'), why('4?')])).toHaveLength(3);
  expect(essayPrompts([{ type: 'basic', front: 'A', concept: 'Osmosis' }, { type: 'cloze', front: 'B', concept: 'osmosis ' }, { type: 'basic', front: 'C', concept: 'Diffusion' }]))
    .toEqual(['Explain in one paragraph (at least 50 words) how Osmosis works, using what you studied.',
      'Explain in one paragraph (at least 50 words) how Diffusion works, using what you studied.']);
  expect(essayPrompts([])).toEqual([]);
});

test('writeHref URL-encodes title and prompt', () => {
  expect(writeHref('A & B', 'Why? 100%')).toBe('/write/new?title=A+%26+B&prompt=Why%3F+100%25');
});
