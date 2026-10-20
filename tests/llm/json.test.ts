import { expect, test } from 'vitest';
import { extractJson } from '../../src/llm/json.js';

test('plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
test('```json fence', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
test('prose before and after', () => expect(extractJson('Here you go: {"a":[1]} hope it helps')).toEqual({ a: [1] }));
test('top-level array', () => expect(extractJson('[1,2]')).toEqual([1, 2]));
test('no JSON throws SyntaxError', () => expect(() => extractJson('sorry')).toThrow(SyntaxError));
