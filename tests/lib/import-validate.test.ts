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
  expect(validateImport({ deckId: '5b0c6a3e-1f2d-4c8a-9e7b-0a1b2c3d4e5f', title: 't', kind: 'text', pages: [{ page: 1, text: words(30) }] })).toEqual({ ok: true });
});

const GENERIC = "We couldn't save your material. Please try again.";
const ok30 = [{ page: 1, text: words(30) }];
test('kind text with 2 pages is rejected', () => {
  const pages = [{ page: 1, text: words(30) }, { page: 2, text: words(30) }];
  expect(validateImport({ ...base, kind: 'text', pages })).toEqual({ ok: false, error: GENERIC });
});
test('text under 20 words is rejected with the new copy', () => {
  expect(validateImport({ ...base, kind: 'text', pages: [{ page: 1, text: 'hello world' }] })).toEqual({ ok: false, error: 'Paste at least a few sentences.' });
});
test('malformed input gets the generic error', () => {
  const bad = (o: object) => validateImport({ ...base, kind: 'text', pages: ok30, ...o } as never);
  expect(bad({ pages: 'nope' })).toEqual({ ok: false, error: GENERIC });
  expect(bad({ title: 'x'.repeat(121) })).toEqual({ ok: false, error: GENERIC });
  expect(bad({ deckId: 'not-a-uuid' })).toEqual({ ok: false, error: GENERIC });
  expect(bad({ examDate: 'tomorrow' })).toEqual({ ok: false, error: GENERIC });
});
