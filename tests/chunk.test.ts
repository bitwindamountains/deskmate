import { expect, test } from 'vitest';
import { chunkByWords, chunkPages, wordCount } from '../src/chunk.js';

test('chunkByWords packs paragraphs and keeps an oversize paragraph whole', () => {
  expect(chunkByWords('a b\n\nc d\n\ne f', 4)).toEqual(['a b\n\nc d', 'e f']);
  expect(chunkByWords('a b c d e f', 2)).toEqual(['a b c d e f']);
  expect(chunkByWords('   ', 10)).toEqual([]);
});

test('wordCount counts whitespace-separated words', () => {
  expect(wordCount(' a  b\nc ')).toBe(3);
  expect(wordCount('  ')).toBe(0);
});

test('chunkPages packs whole pages and records page ranges', () => {
  const pages = [{ page: 1, text: 'a '.repeat(600) }, { page: 2, text: 'b '.repeat(600) }, { page: 3, text: 'c '.repeat(600) }];
  expect(chunkPages(pages, 1500).map((c) => [c.position, c.pageStart, c.pageEnd])).toEqual([[0, 1, 2], [1, 3, 3]]);
});

test('a single page over maxWords splits into consecutive chunks on that page', () => {
  const chunks = chunkPages([{ page: 4, text: 'w '.repeat(2500) }], 1000);
  expect(chunks.map((c) => [c.position, c.pageStart, c.pageEnd, wordCount(c.text)])).toEqual([
    [0, 4, 4, 1000], [1, 4, 4, 1000], [2, 4, 4, 500],
  ]);
});

test('empty pages are skipped', () => {
  const chunks = chunkPages([{ page: 1, text: ' ' }, { page: 2, text: 'hello' }, { page: 3, text: '' }], 100);
  expect(chunks).toEqual([{ position: 0, pageStart: 2, pageEnd: 2, text: 'hello' }]);
});
