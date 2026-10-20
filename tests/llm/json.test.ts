import { expect, test } from 'vitest';
import { extractJson } from '../../src/llm/json.js';

test('plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
test('```json fence', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
test('prose before and after', () => expect(extractJson('Here you go: {"a":[1]} hope it helps')).toEqual({ a: [1] }));
test('top-level array', () => expect(extractJson('[1,2]')).toEqual([1, 2]));
test('no JSON throws SyntaxError', () => expect(() => extractJson('sorry')).toThrow(SyntaxError));
test('prose mentioning [P1] before the object', () =>
  expect(extractJson('In [P1] the thesis is weak. Here is the JSON:\n{"a":[1]}')).toEqual({ a: [1] }));
test('trailing note containing braces', () =>
  expect(extractJson('{"a":1}\nNote: I kept {braces} out.')).toEqual({ a: 1 }));
test('braces inside JSON strings do not end the object early', () =>
  expect(extractJson('Sure: {"q":"use } and \\" here","n":2} done')).toEqual({ q: 'use } and " here', n: 2 }));
