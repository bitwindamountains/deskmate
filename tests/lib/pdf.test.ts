import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { extractPdfPages, hasTextLayer } from '../../src/lib/import/pdf.js';

test('hasTextLayer false for a scanned PDF (all pages empty)', () =>
  expect(hasTextLayer([{ page: 1, text: '' }, { page: 2, text: ' ' }])).toBe(false));

test('hasTextLayer true at 20 words', () => expect(hasTextLayer([{ page: 1, text: 'w '.repeat(20) }])).toBe(true));

test('extractPdfPages reads text from a tiny fixture PDF', async () => {
  const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/two-pages.pdf'));
  const pages = await extractPdfPages(new File([bytes], 'two-pages.pdf'));
  expect(pages.map((p) => p.page)).toEqual([1, 2]);
  expect(pages[0].text).toContain('Page one text about mitochondria.');
  expect(pages[1].text).toContain('Page two text about ATP.');
});
