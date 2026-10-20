import { expect, test } from 'vitest';
import { findAnchor, isGrounded, normalizeText } from '../src/grounding.js';

test('normalizeText folds quotes, dashes, whitespace', () =>
  expect(normalizeText('  “a”  ‘b’ – c — d\n e ')).toBe('"a" \'b\' - c - d e'));

test('exact quote returns its offsets', () => expect(findAnchor('One two three.', 'two')).toEqual({ start: 4, end: 7 }));

test('curly quotes, em dash and extra spaces still match; offsets map to the original', () => {
  const para = 'He said “stop” — then  left.';
  const r = findAnchor(para, 'said "stop" - then left');
  expect(r).not.toBeNull();
  expect(para.slice(r!.start, r!.end)).toBe('said “stop” — then  left');
});

test('leading whitespace in the paragraph does not shift offsets', () => {
  const para = '   Alpha  beta gamma';
  const r = findAnchor(para, 'beta gamma')!;
  expect(para.slice(r.start, r.end)).toBe('beta gamma');
  const r2 = findAnchor(para, 'alpha'.replace('a', 'A') + ' beta')!;
  expect(para.slice(r2.start, r2.end)).toBe('Alpha  beta');
});

test('quote not present returns null', () => expect(findAnchor('abc', 'xyz')).toBeNull());
test('empty quote returns null', () => expect(findAnchor('abc', '  ')).toBeNull());

test('isGrounded true for normalized substring, false otherwise or when empty', () => {
  expect(isGrounded('Mitochondria  produce “ATP”.', 'produce "ATP"')).toBe(true);
  expect(isGrounded('Mitochondria produce ATP.', 'ribosomes')).toBe(false);
  expect(isGrounded('Mitochondria produce ATP.', ' ')).toBe(false);
});
