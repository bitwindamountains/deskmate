import { expect, test } from 'vitest';
import { validateImport } from '@/lib/import/validate';

const words = (n: number) => 'w '.repeat(n);
const base = { newDeckTitle: 'Bio', title: 't' };

test('100,000-word paste is rejected with the word count', () => {
  expect(validateImport({ ...base, kind: 'text', pages: [{ page: 1, text: words(100_000) }] })).toEqual({
    ok: false, error: "That's about 100,000 words. The limit is 12,000 at a time; split it into smaller parts.",
  });
});
test('12,001 words rejected, 12,000 accepted', () => {
  expect(validateImport({ ...base, kind: 'text', pages: [{ page: 1, text: words(12_001) }] }).ok).toBe(false);
  expect(validateImport({ ...base, kind: 'text', pages: [{ page: 1, text: words(12_000) }] }).ok).toBe(true);
});
test('21 pdf pages rejected', () => {
  const pages = Array.from({ length: 21 }, (_, i) => ({ page: i + 1, text: words(10) }));
  expect(validateImport({ ...base, kind: 'pdf', pages })).toEqual({ ok: false, error: 'Pick up to 20 pages at a time.' });
});
test('scanned pdf rejected with the no-text message', () => {
  const r = validateImport({ ...base, kind: 'pdf', pages: [{ page: 1, text: '' }] });
  expect(r).toEqual({ ok: false, error: 'This PDF has no selectable text. Paste the text instead; photo import comes later.' });
});
test('neither deckId nor newDeckTitle is rejected', () => {
  expect(validateImport({ title: 't', kind: 'text', pages: [{ page: 1, text: words(30) }] })).toEqual({ ok: false, error: 'Choose a deck or name a new one.' });
});
test('valid input passes', () => {
  expect(validateImport({ deckId: 'd', title: 't', kind: 'text', pages: [{ page: 1, text: words(30) }] })).toEqual({ ok: true });
});
