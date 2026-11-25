import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// The Anki import loads sql.js's wasm from public/vendor; a stale copy breaks .apkg import only in the browser.
test('the vendored sql.js wasm matches the installed sql.js', () => {
  const { version } = JSON.parse(readFileSync('node_modules/sql.js/package.json', 'utf8'));
  const vendored = `public/vendor/sql-wasm-${version}.wasm`;
  expect(existsSync(vendored), `copy node_modules/sql.js/dist/sql-wasm.wasm to ${vendored}`).toBe(true);
  expect(readFileSync(vendored).equals(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm'))).toBe(true);
  expect(readFileSync('src/app/(app)/study/deck/[deckId]/transfer.tsx', 'utf8')).toContain(`'/vendor/sql-wasm-${version}.wasm'`);
});
