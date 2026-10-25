import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('a .btn label around a visually hidden input shows the focus ring when that input is focused (WCAG 2.4.7)', () => {
  // The confidence chips are radios hidden with sr-only inside a .btn label, so the outline must move to the label.
  const css = readFileSync('src/app/globals.css', 'utf8').replace(/\s+/g, ' ');
  expect(css).toMatch(/\.btn:has\(:focus-visible\) \{ outline: 4px double var\(--focus\); outline-offset: 2px; \}/);
});
