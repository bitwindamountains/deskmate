import { expect, test } from 'vitest';
import { anchorQuote, looksLikeVerse, paragraphHash, paragraphs, validateEssay } from '@/lib/essay/text';

// Real English words, so the English-only check passes and only the length rule is under test.
const WORDS = 'the student wrote that this essay is about how a school can help'.split(' ');
const words = (n: number) => Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ');

test('validateEssay: 49 words fails with the 50-word message; 2,001 words names the count', () => {
  expect(validateEssay(words(49))).toEqual({ ok: false, error: 'Add a little more: feedback needs at least 50 words.' });
  expect(validateEssay(words(50))).toEqual({ ok: true, words: 50 });
  expect(validateEssay(words(2001))).toEqual({
    ok: false,
    error: 'This essay is 2,001 words. Draft Coach handles up to 2,000 words for now; paste one section at a time.',
  });
});

test('validateEssay: an essay that is not in English is refused before any AI call', () => {
  const spanish = Array.from({ length: 12 }, () => 'Los estudiantes pasan más tiempo con sus teléfonos.').join(' ');
  expect(validateEssay(spanish)).toEqual({ ok: false, error: "This doesn't look like English. Draft Coach gives feedback on essays written in English only." });
});

test('validateEssay: more than 40 paragraphs fails', () => {
  const essay = Array.from({ length: 41 }, () => 'two words').join('\n\n');
  expect(validateEssay(essay)).toEqual({ ok: false, error: "That's a lot of paragraphs. Join short ones and try again." });
});

test('paragraphs splits on blank lines', () => {
  expect(paragraphs('One.\n\n  Two.  \n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
});

test('anchorQuote finds the quote in another paragraph when the model gives the wrong index', () => {
  const paras = ['The cat sat.', 'Dogs bark loudly at night.', 'The end.'];
  expect(anchorQuote(paras, 0, 'bark loudly')).toEqual({ paragraph_index: 1, start: 5, end: 16 });
  expect(anchorQuote(paras, 1, 'bark loudly')).toEqual({ paragraph_index: 1, start: 5, end: 16 });
  expect(anchorQuote(paras, 99, 'The end')).toEqual({ paragraph_index: 2, start: 0, end: 7 });
});

test('anchorQuote returns null for words not in the essay', () => {
  expect(anchorQuote(['The cat sat.', 'Dogs bark.'], 0, 'purple elephants')).toBeNull();
});

test('paragraphHash ignores whitespace and curly-quote differences', async () => {
  const a = await paragraphHash('She said “hi”   and it’s fine.');
  const b = await paragraphHash('She said "hi" and\nit\'s fine.');
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(await paragraphHash('Something else.')).not.toBe(a);
});

const POEM = ['The phone glows blue at night', 'I scroll and scroll alone', 'the likes fall down like rain', 'on a screen that is not home',
  'my friends are only pictures', 'their voices turned to text', 'I wonder who is out there', 'and who is coming next',
  'the morning finds me tired', 'the light is in my eyes'].join('\n');

test('looksLikeVerse: many short unpunctuated lines read as a poem; prose and a list of short paragraphs do not (A7)', () => {
  expect(looksLikeVerse(POEM)).toBe(true);
  expect(looksLikeVerse(Array.from({ length: 6 }, () => 'The student wrote that this essay is about how a school can help. '.repeat(3)).join('\n\n'))).toBe(false);
  const shortParas = Array.from({ length: 10 }, (_, i) => `Point ${i + 1} is that the school should act now.`).join('\n');
  expect(looksLikeVerse(shortParas)).toBe(false);
});
